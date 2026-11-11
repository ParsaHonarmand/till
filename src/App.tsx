import { useCallback, useEffect, useMemo, useState } from 'react';
import PinMap, { type Clue } from './PinMap';
import {
  dateOf, flag, fresh, load, loadPlay, loadStats, markHelp, msToMidnight, puzzleFor, recordStats, savePlay, seenHelp, todayNumber,
  type Index, type PlayState, type Puzzle, type Stats,
} from './game';
import { BANDS, COMPASS, MAX, MIN_MULT, PINS, PIN_COST, REVEAL_COST, band, bearing, distanceKm, fmtKm, multiplier, octant, pinPoints } from './geo';

const HEAT_EMOJI = ['⬛', '🟦', '🟨', '🟧', '🟥', '🎯'];
const params = new URLSearchParams(location.search);
const pct = (x: number) => `${Math.round(x * 100)}%`;

export default function App() {
  const [idx, setIdx] = useState<Index | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    load<Index>('data/index.json').then(setIdx, (e) => setErr(String(e)));
  }, []);
  if (err) return <div className="boot">COULDN'T LOAD TODAY'S RECEIPT<small>{err}</small></div>;
  if (!idx) return <Boot />;
  const today = todayNumber();
  const forced = params.get('p');
  const asked = params.has('n') ? parseInt(params.get('n')!, 10) : today;
  const n = Math.max(1, Math.min(today, Number.isFinite(asked) ? asked : today)); // no peeking ahead
  const id = forced && idx.puzzles.includes(forced) ? forced : puzzleFor(n, idx);
  return <Game key={id + n} id={id} n={forced ? null : n} today={today} idx={idx} />;
}

const Boot = () => (
  <div className="boot">
    <span className="printing">PRINTING<i>.</i><i>.</i><i>.</i></span>
  </div>
);

function Game({ id, n, today, idx }: { id: string; n: number | null; today: number; idx: Index }) {
  const [pz, setPz] = useState<Puzzle | null>(null);
  const key = n != null ? 'day:' + n : 'p:' + id;
  const [st, setSt] = useState<PlayState>(() => loadPlay(key) ?? fresh());
  const [draft, setDraft] = useState<[number, number] | null>(null);
  const [modal, setModal] = useState<null | 'help' | 'stats' | 'archive' | 'zoom'>(() => (seenHelp() ? null : 'help'));
  const [stats, setStats] = useState<Stats>(loadStats);
  const [view, setView] = useState<'receipt' | 'map'>('receipt');
  const [flash, setFlash] = useState<string | null>(null);

  useEffect(() => {
    load<Puzzle>(`data/puzzles/${id}.json`).then(setPz);
  }, [id]);
  useEffect(() => savePlay(key, st), [key, st]);

  const total = pz?.segments.length ?? 0;
  const answer = useMemo<[number, number] | null>(() => (pz ? [pz.answer.lat, pz.answer.lon] : null), [pz]);

  const finish = useCallback((s: PlayState): PlayState => {
    const best = Math.min(...s.pins.map((p) => p.km));
    const score = Math.round(pinPoints(best) * multiplier(s.revealed - 1, s.pins.length));
    if (n != null && n === today) setStats(recordStats(n, score)); // archive days don't touch the streak
    return { ...s, done: true, score };
  }, [n, today]);

  const reveal = useCallback(() => setSt((s) => (s.done || s.revealed >= total ? s : { ...s, revealed: s.revealed + 1 })), [total]);
  const drop = useCallback(() => {
    if (!draft || !answer) return;
    const km = distanceKm(draft, answer);
    setSt((s) => {
      if (s.done) return s;
      const next = { ...s, pins: [...s.pins, { lat: draft[0], lon: draft[1], km }] };
      return km <= BANDS[0].max || next.pins.length >= PINS ? finish(next) : next;
    });
    setDraft(null);
    navigator.vibrate?.(km <= BANDS[0].max ? [30, 40, 60] : 25);
    if (km > BANDS[0].max) {
      const prev = st.pins.at(-1);
      const trend = prev ? (km < prev.km ? ' · WARMER' : ' · COLDER') : '';
      setFlash(`${band(km).label}${trend} · GO ${COMPASS[octant(bearing(draft, answer))].toUpperCase()}`);
      setTimeout(() => setFlash(null), 1800);
    }
  }, [draft, answer, finish, st.pins]);
  const lockIn = useCallback(() => setSt((s) => (s.pins.length && !s.done ? finish(s) : s)), [finish]);

  // keyboard: R reveal, Enter drop pin, L lock in, Esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') setModal(null);
      if (modal || st.done) return;
      if (e.key === 'r' || e.key === 'R') reveal();
      if (e.key === 'Enter') drop();
      if ((e.key === 'l' || e.key === 'L') && st.pins.length) lockIn();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modal, st.done, st.pins.length, reveal, drop, lockIn]);

  const clues = useMemo<Clue[]>(() => (answer ? st.pins.map((p) => {
    return { o: octant(bearing([p.lat, p.lon], answer)), heat: band(p.km).heat, hit: p.km <= BANDS[0].max };
  }) : []), [st.pins, answer]);

  if (!pz || !answer) return <Boot />;
  const reveals = st.revealed - 1; // the first line is free
  const worth = Math.round(MAX * multiplier(reveals, st.pins.length + 1)); // best case for the next pin
  const best = st.pins.length ? Math.min(...st.pins.map((p) => p.km)) : null;
  const lockNow = best != null ? Math.round(pinPoints(best) * multiplier(reveals, st.pins.length)) : null;
  const bestNo = best != null ? st.pins.findIndex((p) => p.km === best) + 1 : 0;
  const pinsLeft = PINS - st.pins.length;
  const shown = st.done ? total : st.revealed;

  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="./" aria-label="Till home">
          <span className="logo">TILL</span>
          <span className="tag">one receipt a day · where was it printed?</span>
        </a>
        <div className="meta">
          <button className="no" onClick={() => setModal('archive')} title="Past receipts">
            {n != null ? `No.${n}` : 'PRACTICE'}
          </button>
          <button className="ghost" onClick={() => setModal('stats')} aria-label="Statistics">▥</button>
          <button className="ghost" onClick={() => setModal('help')} aria-label="How to play">?</button>
        </div>
      </header>

      <nav className="tabs" aria-label="Switch panel">
        <button className={view === 'receipt' ? 'on' : ''} onClick={() => setView('receipt')}>🧾 Receipt <small>{shown}/{total}</small></button>
        <button className={view === 'map' ? 'on' : ''} onClick={() => setView('map')}>📍 Map <small>{st.pins.length}/{PINS}</small></button>
      </nav>

      <main className={`board show-${view}${st.done ? ' done' : ''}`}>
        <section className="paper-col">
          <Receipt pz={pz} revealed={shown} full={st.done} onZoom={() => setModal('zoom')} />
          {!st.done && (
            <div className="dock">
              <Pot worth={worth} lockNow={lockNow} pinsLeft={pinsLeft} />
              <div className="reveal-bar">
                <Meter shown={st.revealed} total={total} />
                <button className="btn" onClick={reveal} disabled={st.revealed >= total}>
                  {st.revealed >= total ? 'All lines showing' : <>Reveal a line <span className="cost">−{pct(REVEAL_COST)}</span></>}
                </button>
              </div>
              <button className="btn primary go-map" onClick={() => setView('map')}>
                {st.pins.length ? `Back to the map · ${pinsLeft} pin${pinsLeft > 1 ? 's' : ''} left` : 'Got an idea? Drop a pin →'}
              </button>
            </div>
          )}
        </section>

        <section className="map-col">
          <div className="map-wrap">
            <PinMap pins={st.pins} clues={clues} draft={draft} onDraft={setDraft} answer={st.done ? answer : null} locked={st.done} />
            {flash && <div className="flash" key={flash + st.pins.length}>{flash}</div>}
            {!st.done && !draft && st.pins.length === 0 && <div className="hint">tap anywhere to place a pin · zoom in for precision</div>}
          </div>
          {!st.done ? (
            <div className="guess">
              <Pot worth={worth} lockNow={lockNow} pinsLeft={pinsLeft} />
              <div className="actions">
                <button className="btn primary" disabled={!draft} onClick={drop}>
                  {draft ? `Drop pin ${st.pins.length + 1} of ${PINS}` : 'Tap the map to place a pin'}
                </button>
                {lockNow != null && (
                  <button className="btn" onClick={lockIn}>Lock in pin {bestNo} · {lockNow} pts</button>
                )}
              </div>
              <p className="rule">{PINS} pins · <b>your closest one counts</b> · each line −{pct(REVEAL_COST)}, each extra pin −{pct(PIN_COST)}</p>
              {st.pins.length > 0 && <PinList st={st} answer={answer} />}
            </div>
          ) : (
            <Result pz={pz} st={st} best={best!} n={n} today={today} stats={stats} idx={idx} onStats={() => setModal('stats')} />
          )}
        </section>
      </main>

      <footer className="foot">
        <span>
          Receipt photo by {pz.credit.artist || 'an unknown photographer'} ·{' '}
          <a href={pz.credit.licUrl ?? pz.credit.page} target="_blank" rel="noreferrer">{pz.credit.lic}</a> ·{' '}
          <a href={pz.credit.page} target="_blank" rel="noreferrer">Wikimedia Commons</a>. Blacked out by Till and shared under the same licence.
        </span>
        <span>Map: OpenFreeMap · © OpenMapTiles · © OpenStreetMap contributors.</span>
      </footer>

      {modal === 'help' && <Help onClose={() => { markHelp(); setModal(null); }} />}
      {modal === 'stats' && <StatsModal stats={stats} onClose={() => setModal(null)} />}
      {modal === 'archive' && <Archive today={today} current={n} idx={idx} currentId={id} onClose={() => setModal(null)} />}
      {modal === 'zoom' && <Zoom pz={pz} revealed={shown} full={st.done} onClose={() => setModal(null)} />}
    </div>
  );
}

function Meter({ shown, total }: { shown: number; total: number }) {
  return (
    <div className="meter" aria-label={`${shown} of ${total} lines showing`}>
      {Array.from({ length: total }, (_, i) => <i key={i} className={i < shown ? 'on' : ''} />)}
      <span>{shown}/{total} lines</span>
    </div>
  );
}

/** The one number that only goes down: what you'd bank now, and the most the next pin could be worth. */
function Pot({ worth, lockNow, pinsLeft }: { worth: number; lockNow: number | null; pinsLeft: number }) {
  return (
    <div className="pot" aria-live="polite">
      {lockNow != null ? (
        <>
          <div className="pv"><span className="lbl">lock in now</span><b key={lockNow} className="tick">{lockNow}</b></div>
          {pinsLeft > 0 && <div className="pv dim"><span className="lbl">next pin up to</span><b key={worth} className="tick">{worth}</b></div>}
        </>
      ) : (
        <div className="pv"><span className="lbl">worth up to</span><b key={worth} className="tick">{worth}</b><span className="of">/ {MAX}</span></div>
      )}
    </div>
  );
}

function PinList({ st, answer }: { st: PlayState; answer: [number, number] }) {
  return (
    <ol className="pins">
      {st.pins.map((p, i) => {
        const b = band(p.km);
        const o = octant(bearing([p.lat, p.lon], answer));
        const hit = p.km <= BANDS[0].max;
        const prev = st.pins[i - 1];
        const trend = prev ? (p.km < prev.km ? 'warmer' : 'colder') : '';
        return (
          <li key={i} className={`heat-${b.heat}`}>
            <span className="pn">{i + 1}</span>
            <span className="arrow" style={{ rotate: hit ? '0deg' : `${o * 45}deg` }} title={hit ? 'Spot on' : `The shop is ${COMPASS[o]} of this pin`}>
              {hit ? '🎯' : '↑'}
            </span>
            <span className="bl">{b.label}{trend && <em className={trend}>{trend === 'warmer' ? '▲ warmer' : '▼ colder'}</em>}</span>
            <span className="bs">{hit ? '' : `go ${COMPASS[o]} · ${pinPoints(p.km)} pts`}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Receipt({ pz, revealed, full, onZoom }: { pz: Puzzle; revealed: number; full: boolean; onZoom: () => void }) {
  return (
    <div className="paper" onClick={onZoom} role="button" tabIndex={0} aria-label="Zoom in on the receipt" onKeyDown={(e) => e.key === ' ' && onZoom()}>
      <Photo pz={pz} revealed={revealed} full={full} />
      <span className="zoom-hint">⤢ zoom</span>
    </div>
  );
}

function Photo({ pz, revealed, full }: { pz: Puzzle; revealed: number; full: boolean }) {
  return (
    <div className="photo" style={{ aspectRatio: `${pz.w} / ${pz.h}` }}>
      <img src={full ? pz.full : pz.img} alt="A real shop receipt with most lines blacked out" draggable={false} />
      {!full &&
        pz.segments.slice(0, revealed).flatMap((s, i) =>
          s.parts.map((p, j) => (
            <img
              key={`${i}-${j}`}
              className="tile"
              src={p.tile}
              alt=""
              draggable={false}
              style={{ left: `${p.b[0] * 100}%`, top: `${p.b[1] * 100}%`, width: `${p.b[2] * 100}%`, height: `${p.b[3] * 100}%` }}
            />
          )),
        )}
    </div>
  );
}

function useCountdown() {
  const [ms, setMs] = useState(msToMidnight);
  useEffect(() => {
    const t = setInterval(() => setMs(msToMidnight()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.floor(ms / 1000);
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
}

function shareText(n: number | null, st: PlayState, total: number, best: number) {
  const strip = Array.from({ length: total }, (_, i) => (i < st.revealed ? '🧾' : '⬛')).join('');
  const pins = st.pins.map((p) => HEAT_EMOJI[band(p.km).heat]).join('');
  return [
    `TILL ${n != null ? 'No.' + n : '(practice)'} — ${st.score}/${MAX}`,
    strip,
    `📍${pins} best pin ${fmtKm(best)} away`,
    `${location.origin}${location.pathname}`,
  ].join('\n');
}

function Result({ pz, st, best, n, today, stats, idx, onStats }: {
  pz: Puzzle; st: PlayState; best: number; n: number | null; today: number; stats: Stats; idx: Index; onStats: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const countdown = useCountdown();
  const text = shareText(n, st, pz.segments.length, best);
  const practice = useMemo(() => {
    const others = idx.puzzles.filter((p) => p !== pz.id);
    return others[(pz.id.length * 7 + st.score) % Math.max(1, others.length)];
  }, [idx, pz.id, st.score]);
  const share = async () => {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch { /* cancelled */ }
  };
  const verdict = st.score >= 900 ? 'LOCAL!' : st.score >= 700 ? 'WELL TRAVELLED' : st.score >= 450 ? 'RIGHT AREA' : st.score >= 200 ? 'TOURIST' : 'LOST';
  const bestPin = st.pins.reduce((a, p) => (p.km < a.km ? p : a));
  return (
    <div className="result">
      <div className="stamp-row">
        <div className="stamp">
          <span className="verdict">{verdict}</span>
          <span className="pts">{st.score}</span>
          <span className="of">/ {MAX}</span>
        </div>
        <div className="where">
          <div className="country">{flag(pz.answer.cc)} {pz.answer.country}{pz.year ? <span className="yr"> · {pz.year}</span> : null}</div>
          <div className="place">{pz.answer.place}</div>
          <div className="km">
            your best pin was <b>{fmtKm(best)}</b> away{bestPin.km <= BANDS[0].max ? ' — on the doorstep' : ''}
          </div>
        </div>
      </div>
      <Tally st={st} best={best} bestNo={st.pins.indexOf(bestPin) + 1} />
      {pz.note && <p className="note"><b>The giveaways:</b> {pz.note}</p>}
      <div className="actions">
        <button className="btn primary" onClick={share}>{copied ? 'Copied to clipboard ✓' : 'Share result'}</button>
        {n === today && <button className="btn" onClick={onStats}>Stats</button>}
        {practice && <a className="btn" href={`?p=${practice}`}>Practice receipt</a>}
      </div>
      <pre className="share-preview">{text}</pre>
      {n === today && (
        <div className="next">
          next receipt in <b>{countdown}</b>
          {stats.streak > 1 && <span> · 🔥 {stats.streak} day streak</span>}
        </div>
      )}
    </div>
  );
}

/** The score, itemised like a till receipt. */
function Tally({ st, best, bestNo }: { st: PlayState; best: number; bestNo: number }) {
  const lines = st.revealed - 1, extra = st.pins.length - 1;
  const raw = 1 - REVEAL_COST * lines - PIN_COST * extra;
  const mult = multiplier(lines, st.pins.length);
  return (
    <div className="tally">
      <div className="tl"><span>BEST PIN · No.{bestNo} · {fmtKm(best)}</span><i /><b>{pinPoints(best)}</b></div>
      <div className="tl"><span>LINES REVEALED {lines} × {pct(REVEAL_COST)}</span><i /><b>−{pct(REVEAL_COST * lines)}</b></div>
      <div className="tl"><span>EXTRA PINS {extra} × {pct(PIN_COST)}</span><i /><b>−{pct(PIN_COST * extra)}</b></div>
      {raw < MIN_MULT && <div className="tl"><span>FLOOR (never below {pct(MIN_MULT)})</span><i /><b>{pct(MIN_MULT)}</b></div>}
      <div className="tl tot"><span>TOTAL <small>{pinPoints(best)} × {pct(mult)}</small></span><i /><b>{st.score}</b></div>
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <button className="x" onClick={onClose} aria-label="Close">×</button>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Help({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="HOW TO PLAY" onClose={onClose}>
      <p className="lede">One real receipt a day, photographed somewhere in the world. The shop's name and address are blacked out. <b>Pin where it was printed.</b></p>
      <ol className="steps">
        <li><span>🧾</span><div><b>Read the clues.</b> One line is free. Reveal more — prices, tax, items, the footer — for {pct(REVEAL_COST)} of your score each.</div></li>
        <li><span>📍</span><div><b>Drop a pin.</b> Up to {MAX} points, depending on how close you are to the shop. Within 25 km ends the round.</div></li>
        <li><span>🧭</span><div><b>Missed?</b> You'll get an arrow pointing towards the shop and how hot you are — and whether you're warmer or colder than your last pin. You get {PINS} pins, each extra one costs {pct(PIN_COST)}.</div></li>
        <li><span>🏁</span><div><b>Your closest pin counts.</b> Lock it in whenever you like. The score panel always shows what you'd bank right now.</div></li>
      </ol>
      <div className="legend">
        {BANDS.slice().reverse().map((b) => <span key={b.heat} className={`heat-${b.heat}`}>{HEAT_EMOJI[b.heat]} {b.short} <small>{b.range}</small></span>)}
      </div>
      <p className="small">Shortcuts: <kbd>R</kbd> reveal · <kbd>Enter</kbd> drop pin · <kbd>L</kbd> lock in. Every receipt is a real, openly licensed photo from Wikimedia Commons.</p>
      <button className="btn primary wide" onClick={onClose}>Start</button>
    </Modal>
  );
}

function StatsModal({ stats, onClose }: { stats: Stats; onClose: () => void }) {
  const max = Math.max(1, ...stats.dist);
  const labels = ['0–199', '200–399', '400–599', '600–799', '800+'];
  return (
    <Modal title="STATISTICS" onClose={onClose}>
      <div className="stats">
        <div><b>{stats.played}</b>played</div>
        <div><b>{stats.played ? Math.round(stats.total / stats.played) : 0}</b>average</div>
        <div><b>{stats.best}</b>best</div>
        <div><b>{stats.streak}</b>streak</div>
        <div><b>{stats.maxStreak}</b>max streak</div>
      </div>
      <h3>SCORE DISTRIBUTION</h3>
      <div className="dist">
        {stats.dist.map((v, i) => (
          <div key={i} className="drow">
            <span>{labels[i]}</span>
            <div className="bar" style={{ width: `${Math.max(6, (v / max) * 100)}%` }}>{v}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function Archive({ today, current, idx, currentId, onClose }: { today: number; current: number | null; idx: Index; currentId: string; onClose: () => void }) {
  const days = Array.from({ length: today }, (_, i) => today - i);
  const dailyIds = new Set(days.map((d) => puzzleFor(d, idx)));
  const practice = idx.puzzles.filter((p) => !dailyIds.has(p));
  return (
    <Modal title="PAST RECEIPTS" onClose={onClose}>
      <ul className="archive">
        {days.map((d) => {
          const p = loadPlay('day:' + d);
          return (
            <li key={d} className={d === current ? 'cur' : ''}>
              <a href={d === today ? './' : `?n=${d}`}>
                <span className="an">No.{d}</span>
                <span className="ad">{dateOf(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</span>
                <span className="as">{p?.done ? `${p.score} pts` : p?.pins.length || (p && p.revealed > 1) ? 'in progress' : d === today ? 'today' : 'play →'}</span>
              </a>
            </li>
          );
        })}
      </ul>
      {practice.length > 0 && (
        <>
          <h3>PRACTICE RECEIPTS</h3>
          <p className="small">Future daily receipts, open for practice. Doesn't affect your streak.</p>
          <ul className="archive">
            {practice.map((p, i) => {
              const s = loadPlay('p:' + p);
              return (
                <li key={p} className={p === currentId && current == null ? 'cur' : ''}>
                  <a href={`?p=${p}`}>
                    <span className="an">#{i + 1}</span>
                    <span className="ad">practice</span>
                    <span className="as">{s?.done ? `${s.score} pts` : 'play →'}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Modal>
  );
}

function Zoom({ pz, revealed, full, onClose }: { pz: Puzzle; revealed: number; full: boolean; onClose: () => void }) {
  return (
    <div className="overlay zoom" onClick={onClose}>
      <div className="zoom-paper" onClick={(e) => e.stopPropagation()} style={{ width: pz.w > pz.h ? 'min(94vw, 1100px)' : 'min(94vw, 720px)' }}>
        <Photo pz={pz} revealed={revealed} full={full} />
      </div>
      <button className="x big" onClick={onClose} aria-label="Close">×</button>
    </div>
  );
}
