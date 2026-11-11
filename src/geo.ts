// Distances, directions and scoring.

const R = 6371; // km
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceKm(a: [number, number], b: [number, number]): number {
  const dLat = rad(b[0] - a[0]);
  const dLon = rad(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Direction from a to b as it looks on the map (rhumb line, Mercator), degrees clockwise from north.
 * Deliberately not the great-circle bearing: from Texas, Hong Kong is "north-west" over the pole,
 * which is true but looks wrong on a flat map.
 */
export function bearing(a: [number, number], b: [number, number]): number {
  const p1 = rad(a[0]), p2 = rad(b[0]);
  let dl = rad(b[1] - a[1]);
  if (dl > Math.PI) dl -= 2 * Math.PI;
  if (dl < -Math.PI) dl += 2 * Math.PI;
  const dpsi = Math.log(Math.tan(Math.PI / 4 + p2 / 2) / Math.tan(Math.PI / 4 + p1 / 2));
  return ((Math.atan2(dl, dpsi) * 180) / Math.PI + 360) % 360;
}

export const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export const octant = (deg: number) => Math.round(deg / 45) % 8;

/**
 * Feedback after a wrong pin: which way the shop is (one of 8 compass points) and how hot you are.
 * Deliberately vague: no area on the map and no exact distance, so it stays a hunch, not a calculation.
 * `range` is only for the how-to-play legend.
 */
export const BANDS = [
  { max: 25, label: 'ON THE DOORSTEP', short: 'doorstep', range: 'within 25 km', heat: 5 },
  { max: 150, label: 'HOT', short: 'hot', range: 'within 150 km', heat: 4 },
  { max: 500, label: 'WARM', short: 'warm', range: 'within 500 km', heat: 3 },
  { max: 1500, label: 'LUKEWARM', short: 'lukewarm', range: 'within 1,500 km', heat: 2 },
  { max: 4000, label: 'COLD', short: 'cold', range: 'within 4,000 km', heat: 1 },
  { max: Infinity, label: 'FREEZING', short: 'freezing', range: 'over 4,000 km', heat: 0 },
];
export const band = (km: number) => BANDS.find((b) => km <= b.max)!;

export const MAX = 1000;
export const PIN_COST = 0.12; // each extra pin after the first
export const REVEAL_COST = 0.06; // each line revealed after the free one
export const MIN_MULT = 0.25;
export const PINS = 3;

/** Points for a pin at this distance, before penalties. ~1000 within a few km, ~500 at 1,000 km. */
export function pinPoints(km: number): number {
  if (km <= 1) return MAX;
  return Math.round(MAX * Math.exp(-km / 1450));
}
export function multiplier(reveals: number, pins: number): number {
  return Math.max(MIN_MULT, 1 - REVEAL_COST * reveals - PIN_COST * Math.max(0, pins - 1));
}

export function fmtKm(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  if (km < 10) return `${km.toFixed(1)} km`;
  return `${Math.round(km).toLocaleString('en-GB')} km`;
}
