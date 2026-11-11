// Puzzle data, daily schedule and local storage.

export interface Segment {
  parts: { b: [number, number, number, number]; tile: string }[]; // strips (x, y, w, h as fractions) and their unredacted crops
  label: string;
}
export interface Puzzle {
  id: string;
  img: string; // redacted base image (every segment blacked out, private details blurred)
  full: string; // fully revealed image (private details still blurred)
  w: number;
  h: number;
  segments: Segment[]; // in reveal order; segments[0] is shown free
  answer: { lat: number; lon: number; place: string; country: string; cc: string; precision: 'shop' | 'street' | 'city' };
  note: string; // what gave it away
  year?: string;
  credit: { artist: string; lic: string; licUrl: string | null; page: string };
}
export interface Index { puzzles: string[] } // ids in schedule order

export const EPOCH = Date.UTC(2026, 10, 1); // No.1 = 1 Nov 2026, so launch day (11 Nov) opens with ten days of archive
export const ROUNDS = 3; // receipts per day

export function todayNumber(now = new Date()): number {
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((local - EPOCH) / 86400000) + 1;
}
/** The day's receipts: consecutive ids from the schedule (wrapping round when the pool runs out). */
export function puzzlesFor(n: number, idx: Index): string[] {
  const len = idx.puzzles.length;
  return Array.from({ length: ROUNDS }, (_, r) => idx.puzzles[((((n - 1) * ROUNDS + r) % len) + len) % len]);
}

const cache = new Map<string, Promise<unknown>>();
export function load<T>(url: string): Promise<T> {
  if (!cache.has(url)) cache.set(url, fetch(url).then((r) => {
    if (!r.ok) throw new Error(url + ' ' + r.status);
    return r.json();
  }));
  return cache.get(url) as Promise<T>;
}

// ------------------------------------------------------------ state
export interface Pin { lat: number; lon: number; km: number }
export interface PlayState { revealed: number; pins: Pin[]; done: boolean; score: number }
export const fresh = (): PlayState => ({ revealed: 1, pins: [], done: false, score: 0 });

const KEY = 'till:v2:'; // v2: three receipts a day
export function loadPlay(key: string): PlayState | null {
  try { return JSON.parse(localStorage.getItem(KEY + 'play:' + key) || 'null'); } catch { return null; }
}
export function savePlay(key: string, s: PlayState) {
  try { localStorage.setItem(KEY + 'play:' + key, JSON.stringify(s)); } catch { /* private mode */ }
}

export interface Stats { played: number; total: number; best: number; streak: number; maxStreak: number; last: number; dist: number[] }
const EMPTY: Stats = { played: 0, total: 0, best: 0, streak: 0, maxStreak: 0, last: 0, dist: [0, 0, 0, 0, 0] };
/** Day-total buckets for the chart: 0–599, 600–1199, 1200–1799, 1800–2399, 2400–3000. */
export const bucket = (score: number) => Math.min(4, Math.floor(score / 600));
export function loadStats(): Stats {
  try {
    const s = { ...EMPTY, ...JSON.parse(localStorage.getItem(KEY + 'stats') || '{}') };
    return { ...s, dist: s.dist?.length === 5 ? s.dist : [...EMPTY.dist] };
  } catch { return { ...EMPTY, dist: [...EMPTY.dist] }; }
}
export function recordStats(n: number, score: number): Stats {
  const s = loadStats();
  if (s.last === n) return s;
  s.played++;
  s.total += score;
  s.best = Math.max(s.best, score);
  s.streak = s.last === n - 1 ? s.streak + 1 : 1;
  s.maxStreak = Math.max(s.maxStreak, s.streak);
  s.dist[bucket(score)]++;
  s.last = n;
  try { localStorage.setItem(KEY + 'stats', JSON.stringify(s)); } catch { /* private mode */ }
  return s;
}
export const flag = (cc: string) => cc && cc.length === 2 ? String.fromCodePoint(...[...cc.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '';
export const dateOf = (n: number) => new Date(EPOCH + (n - 1) * 86400000);
export function msToMidnight(now = new Date()) {
  const m = new Date(now);
  m.setHours(24, 0, 0, 0);
  return m.getTime() - now.getTime();
}

export function seenHelp(): boolean {
  try { return localStorage.getItem(KEY + 'help') === '1'; } catch { return true; }
}
export function markHelp() {
  try { localStorage.setItem(KEY + 'help', '1'); } catch { /* private mode */ }
}
