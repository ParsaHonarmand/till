import { useEffect, useRef, useState } from 'react';
import { LngLatBounds, Map as MLMap, Marker, NavigationControl, type ExpressionSpecification, type GeoJSONSource, type MapMouseEvent, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre finds its worker next to its own module, which breaks once bundled; hand it a bundled copy
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import type { Pin } from './game';

setWorkerUrl(workerUrl);

/** What a wrong pin told you: roughly which way (compass octant) and how hot. */
export interface Clue { o: number; heat: number; hit: boolean }

interface Props {
  pins: Pin[];
  clues: Clue[]; // one per pin
  draft: [number, number] | null;
  onDraft: (p: [number, number]) => void;
  answer: [number, number] | null; // shown when the round is over
  locked: boolean;
}

// OpenFreeMap: free vector tiles with no key or usage cap (OpenStreetMap data)
const STYLE = 'https://tiles.openfreemap.org/styles/positron';
// English names where OSM has them, so players aren't reading "Deutschland" or "Österreich"
const EN: ExpressionSpecification = ['coalesce', ['get', 'name:en'], ['get', 'name_en'], ['get', 'name']];

function pinEl(cls: string, text: string, dir?: number) {
  const el = document.createElement('div');
  el.className = 'pin-wrap';
  el.innerHTML = `<div class="pin ${cls}"><span>${text}</span></div>` + (dir != null ? `<b class="dir" style="rotate:${dir - 90}deg"><i><svg viewBox="0 0 34 20" width="34" height="20"><path d="M2 10h22M18 3l9 7-9 7" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 10h22M18 3l9 7-9 7" fill="none" stroke="#14171c" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></i></b>` : '');
  return el;
}

export default function PinMap({ pins, clues, draft, onDraft, answer, locked }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<Marker[]>([]);
  const [ready, setReady] = useState(false);
  const cb = useRef(onDraft);
  const lockedRef = useRef(locked);
  useEffect(() => {
    cb.current = onDraft;
    lockedRef.current = locked;
  }, [onDraft, locked]);

  useEffect(() => {
    if (!el.current) return;
    const m = new MLMap({
      container: el.current,
      style: STYLE,
      center: [10, 30],
      zoom: 1,
      minZoom: 0.6,
      maxZoom: 17,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      attributionControl: { compact: true },
    });
    m.touchZoomRotate.disableRotation();
    m.keyboard.disable(); // the game uses R / Enter / L
    m.addControl(new NavigationControl({ showCompass: false }), 'top-left');
    m.on('load', () => {
      for (const l of m.getStyle().layers) {
        if (l.type !== 'symbol') continue;
        const tf = m.getLayoutProperty(l.id, 'text-field');
        if (tf && JSON.stringify(tf).includes('name')) m.setLayoutProperty(l.id, 'text-field', EN);
      }
      m.addSource('lines', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      m.addLayer({ id: 'lines', type: 'line', source: 'lines', paint: { 'line-color': '#e0342b', 'line-width': 2.5, 'line-dasharray': [2, 2] } });
      setReady(true);
    });
    m.on('click', (e: MapMouseEvent) => {
      if (lockedRef.current) return;
      const p = e.lngLat.wrap();
      cb.current([p.lat, p.lng]);
    });
    map.current = m;
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      m.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    const add = (at: [number, number], e: HTMLElement) =>
      markers.current.push(new Marker({ element: e, anchor: 'bottom' }).setLngLat([at[1], at[0]]).addTo(m));

    pins.forEach((p, i) => {
      const c = clues[i];
      add([p.lat, p.lon], pinEl(`used heat-bg-${c?.heat ?? 0}`, String(i + 1), c && !c.hit && !answer ? c.o * 45 : undefined));
    });
    if (draft && !answer) add(draft, pinEl('draft', String(pins.length + 1)));

    const src = m.getSource('lines') as GeoJSONSource | undefined;
    if (answer) {
      add(answer, pinEl('answer', '🧾'));
      src?.setData({
        type: 'FeatureCollection',
        features: pins.map((p) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: [[p.lon, p.lat], [answer[1], answer[0]]] } })),
      });
      const b = new LngLatBounds([answer[1], answer[0]], [answer[1], answer[0]]);
      pins.forEach((p) => b.extend([p.lon, p.lat]));
      m.fitBounds(b, { padding: 60, maxZoom: 12, duration: 1400 });
    } else {
      src?.setData({ type: 'FeatureCollection', features: [] });
    }
  }, [pins, clues, draft, answer, ready]);

  return <div ref={el} className="map" />;
}
