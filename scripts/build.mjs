#!/usr/bin/env node
// Turn hand-checked receipts (data/receipts.json) into game files in public/.
//
// data/receipts.json entries:
//   { id, title,                          // Commons file title
//     answer: { lat, lon, place, country, precision },
//     year, note,                         // shown at the end
//     segments: [[row, row…], …],         // revealable groups, in reveal order (rows from `npm run rows`)
//     hidden:  [row…], hiddenBoxes: [[x,y,w,h]…],   // never revealed in play: shop name, address, logo
//     private: [row…], privateBoxes: [[x,y,w,h]…] } // pixelated everywhere: card digits, names
// Rows not listed anywhere are treated as hidden (and reported), so nothing leaks by accident.

import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rows, imgName } from './rows.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p) => JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8'));
const receipts = await read('data/receipts.json');
const ocr = await read('.work/ocr.json');
const cands = Object.fromEntries((await read('.work/candidates.json')).map((c) => [c.title, c]));

const PAD = 0.004;
const specs = [];
const meta = [];
for (const r of receipts) {
  const file = imgName(r.title);
  const o = ocr[file];
  const c = cands[r.title];
  if (!o || !c) { console.warn('missing ocr/candidate for', r.title); continue; }
  const rs = rows(o);
  const x0 = Math.max(0, Math.min(...rs.map((x) => x.x0)) - 0.01);
  const x1 = Math.min(1, Math.max(...rs.map((x) => x.x1)) + 0.01);

  // who owns each row: segment index, 'H' (never revealed in play) or 'P' (pixelated everywhere)
  const owner = new Array(rs.length).fill('H');
  const assigned = new Set();
  r.segments.forEach((g, si) => g.forEach((i) => { owner[i] = si; assigned.add(i); }));
  (r.hidden ?? []).forEach((i) => { owner[i] = 'H'; assigned.add(i); });
  (r.private ?? []).forEach((i) => { owner[i] = 'P'; assigned.add(i); });
  const leftover = rs.map((_, i) => i).filter((i) => !assigned.has(i));
  if (leftover.length) console.warn(`${r.id}: rows ${leftover.join(',')} not assigned -> hidden`);

  // Split a set of rows into runs that never cross a row owned by someone else
  // (crossing H/P rows is fine: those are inked/pixelated in the play image anyway).
  const runs = (want) => {
    const out = [];
    let cur = [];
    rs.forEach((_, i) => {
      if (want(owner[i])) cur.push(i);
      else if (owner[i] !== 'H' && owner[i] !== 'P') { if (cur.length) out.push(cur); cur = []; }
    });
    if (cur.length) out.push(cur);
    return out;
  };
  // full-width bar for a run, padded into (but never past the middle of) the gap to its neighbours
  const bar = (ids) => {
    const a = rs[ids[0]], b = rs[ids.at(-1)];
    const prev = rs[ids[0] - 1], next = rs[ids.at(-1) + 1];
    const top = prev ? Math.min(PAD, Math.max(0.0005, (a.y0 - prev.y1) / 2 - 0.0008)) : PAD;
    const bot = next ? Math.min(PAD, Math.max(0.0005, (next.y0 - b.y1) / 2 - 0.0008)) : PAD;
    const y0 = Math.max(0, Math.min(...ids.map((i) => rs[i].y0)) - top);
    const y1 = Math.min(1, Math.max(...ids.map((i) => rs[i].y1)) + bot);
    return [x0, y0, x1 - x0, y1 - y0];
  };
  const rowBox = (i) => [Math.max(0, rs[i].x0 - 0.005), rs[i].y0 - PAD / 2, rs[i].x1 - rs[i].x0 + 0.01, rs[i].y1 - rs[i].y0 + PAD];

  // crop to the text area plus a margin, so landscape photos of small receipts aren't tiny
  const cx0 = Math.max(0, x0 - 0.06), cx1 = Math.min(1, x1 + 0.06);
  const cy0 = Math.max(0, Math.min(...rs.map((x) => x.y0)) - 0.05), cy1 = Math.min(1, Math.max(...rs.map((x) => x.y1)) + 0.05);
  const crop = r.crop ?? [cx0, cy0, cx1 - cx0, cy1 - cy0];
  const rel = (b) => [(b[0] - crop[0]) / crop[2], (b[1] - crop[1]) / crop[3], b[2] / crop[2], b[3] / crop[3]];

  const hidden = runs((o) => o === 'H').filter((run) => run.some((i) => owner[i] === 'H')).map(bar);
  // logos printed above the first line of text
  if (r.inkTop) hidden.push([x0, crop[1], x1 - x0, Math.max(0, rs[0].y0 - crop[1])]);
  specs.push({
    src: path.join(ROOT, '.cache/img', file),
    out: path.join(ROOT, 'public/receipts', r.id),
    maxW: 1100,
    crop,
    segments: r.segments.map((_, si) => runs((o) => o === si).map((run) => rel(bar(run)))),
    hidden: [...hidden, ...(r.hiddenBoxes ?? [])].map(rel),
    private: [...(r.private ?? []).map((i) => rowBox(i)), ...(r.privateBoxes ?? [])].map(rel),
  });
  meta.push({ r, c });
}

await fs.writeFile(path.join(ROOT, '.work/render-spec.json'), JSON.stringify(specs));
execFileSync('swift', [path.join(ROOT, 'scripts/render.swift'), path.join(ROOT, '.work/render-spec.json')], { stdio: 'inherit' });

await fs.mkdir(path.join(ROOT, 'public/data/puzzles'), { recursive: true });
const ids = [];
for (const { r, c } of meta) {
  const t = await read(`public/receipts/${r.id}/tiles.json`);
  const puzzle = {
    id: r.id,
    img: `receipts/${r.id}/base.jpg`,
    full: `receipts/${r.id}/full.jpg`,
    w: t.w,
    h: t.h,
    segments: t.tiles.map((parts, i) => ({
      parts: parts.map((b, j) => ({ b: b.map((v) => +v.toFixed(5)), tile: `receipts/${r.id}/s${i}_${j}.jpg` })),
      label: r.labels?.[i] ?? '',
    })),
    answer: r.answer,
    note: r.note ?? '',
    year: r.year,
    credit: { artist: c.artist, lic: c.lic, licUrl: c.licUrl, page: c.page },
  };
  await fs.writeFile(path.join(ROOT, `public/data/puzzles/${r.id}.json`), JSON.stringify(puzzle));
  ids.push(r.id);
}
await fs.writeFile(path.join(ROOT, 'public/data/index.json'), JSON.stringify({ puzzles: ids }));
console.log(`built ${ids.length} puzzles`);
