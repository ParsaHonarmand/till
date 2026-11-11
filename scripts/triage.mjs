#!/usr/bin/env node
// Rank downloaded candidates by how usable they look as a puzzle (after OCR).
// Usage: node scripts/triage.mjs [minScore]   -> prints a table, writes .work/triage.json
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rows, imgName } from './rows.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (p) => JSON.parse(await fs.readFile(path.join(ROOT, p), 'utf8'));
const cands = await read('.work/candidates.json');
const ocr = await read('.work/ocr.json');

const PRICE = /\d+[.,]\d{2}\b/;
const out = [];
for (const c of cands) {
  const o = ocr[imgName(c.title)];
  if (!o) continue;
  const rs = rows(o);
  const prices = rs.filter((r) => PRICE.test(r.text)).length;
  const conf = rs.length ? rs.reduce((s, r) => s + r.conf, 0) / rs.length : 0;
  // receipts are tall and narrow; text should be mostly level (rows not wildly overlapping)
  const country = c.cats.map((x) => x.match(/^Receipts (?:of|from|in) (?:the )?(.+)$/)?.[1]).find(Boolean) ?? '';
  const score = Math.min(rs.length, 40) / 40 + Math.min(prices, 12) / 12 + conf;
  out.push({ title: c.title, file: imgName(c.title), rows: rs.length, prices, conf: +conf.toFixed(2), country, cats: c.cats.slice(0, 6), coord: c.coord, score: +score.toFixed(2) });
}
out.sort((a, b) => b.score - a.score);
await fs.writeFile(path.join(ROOT, '.work/triage.json'), JSON.stringify(out, null, 1));
const min = parseFloat(process.argv[2] ?? '2');
const good = out.filter((x) => x.score >= min);
console.log(`${out.length} with OCR, ${good.length} score >= ${min}`);
for (const x of good) console.log(`${x.score.toFixed(2)}  r${String(x.rows).padStart(3)} p${String(x.prices).padStart(3)}  ${(x.country || '?').padEnd(14).slice(0, 14)} ${x.title.slice(5, 90)}`);
