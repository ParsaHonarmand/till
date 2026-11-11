#!/usr/bin/env node
// Print a receipt's OCR rows with their numbers (used to write data/receipts.json by hand).
// Usage: node scripts/show-rows.mjs "<Commons title or file name>"
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rows, imgName } from './rows.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ocr = JSON.parse(await fs.readFile(path.join(ROOT, '.work/ocr.json'), 'utf8'));
for (const arg of process.argv.slice(2)) {
  const key = arg.startsWith('File:') ? imgName(arg) : arg;
  const o = ocr[key];
  if (!o) { console.log('no OCR for', key); continue; }
  console.log(`== ${key} (${o.w}x${o.h})`);
  rows(o).forEach((r, i) => console.log(`${String(i).padStart(3)} y${(r.y0 * 100).toFixed(1).padStart(5)}  ${r.text}`));
}
