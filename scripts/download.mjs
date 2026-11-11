#!/usr/bin/env node
// Download 1600px versions of candidate receipts into .cache/img (skips files already there).
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'TillGame/0.1 (receipt geography game prototype)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
import { imgName } from './rows.mjs';

const cands = JSON.parse(await fs.readFile(path.join(ROOT, '.work/candidates.json'), 'utf8'));
const only = process.argv[2] ? new Set(JSON.parse(await fs.readFile(process.argv[2], 'utf8'))) : null;
const dir = path.join(ROOT, '.cache/img');
await fs.mkdir(dir, { recursive: true });
// Standard-size thumbnail URL (originals and odd sizes are throttled hard).
function thumbUrl(c) {
  const step = c.w > 960 ? 1280 : 960; // never the original: originals are what gets blocked
  const u = new URL(c.url);
  const parts = u.pathname.split('/'); // /wikipedia/commons/d/d4/Name.jpg
  const name = parts.at(-1);
  const ext = /\.(tiff?|webp|gif)$/i.test(name) ? '.jpg' : '';
  return `${u.origin}/wikipedia/commons/thumb/${parts.slice(3).join('/')}/${step}px-${name}${ext}`;
}
let n = 0;
let blocked = 0;
const order = only ? [...only].map((t) => cands.find((c) => c.title === t)).filter(Boolean) : cands;
for (const c of order) {
  const f = path.join(dir, imgName(c.title));
  try { await fs.access(f); continue; } catch {}
  for (let i = 0; i < 5; i++) {
    await sleep(1200);
    // standard thumbnail widths are pre-rendered and cached by Wikimedia; odd widths get throttled hard
    const src = thumbUrl(c);
    const r = await fetch(src, { headers: { 'User-Agent': UA } });
    if (r.status === 429) {
      // respect Retry-After: Wikimedia blocks the whole client for that long
      const wait = Math.min(900, parseInt(r.headers.get('retry-after') || '60', 10)) * 1000;
      blocked++;
      if (blocked > 2) { console.log('still rate-limited, stopping (rerun later)'); process.exit(2); }
      console.log(`429, waiting ${wait / 1000 + 60}s`);
      await sleep(wait + 60000);
      continue;
    }
    if (r.status >= 500) { await sleep(4000 * (i + 1)); continue; }
    if (!r.ok) { console.log('fail', r.status, c.title); break; }
    blocked = 0;
    await fs.writeFile(f, Buffer.from(await r.arrayBuffer()));
    n++;
    break;
  }
  if (n % 25 === 0) console.log(`downloaded ${n}`);
}
console.log(`\ndownloaded ${n} new`);
