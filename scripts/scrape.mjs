#!/usr/bin/env node
// Find openly licensed photos of shop receipts on Wikimedia Commons.
// Keeps only licences that allow commercial use AND modification (we black out lines),
// i.e. public domain, CC0, CC BY, CC BY-SA. Commons itself bans NC/ND, but we check anyway.
//
// Output: .work/candidates.json  [{title, url, thumb, w, h, lic, licUrl, artist, credit, cats, coord}]

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const UA = 'TillGame/0.1 (receipt geography game prototype)';
const API = 'https://commons.wikimedia.org/w/api.php';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(params) {
  const qs = new URLSearchParams({ format: 'json', formatversion: '2', ...params });
  for (let i = 0; i < 6; i++) {
    await sleep(1100);
    // POST: batches of 50 long (often non-Latin) titles overflow a GET URL
    const r = await fetch(API, { method: 'POST', headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: qs });
    if (r.status === 429 || r.status >= 500) { await sleep(5000 * (i + 1)); continue; }
    if (!r.ok) throw new Error(`${r.status} ${qs}`);
    return r.json();
  }
  throw new Error('gave up: ' + qs);
}

// Searches. deepcat follows the Receipts category tree; the rest catch uncategorised files by title.
const QUERIES = [
  'deepcat:"Receipts"',
  'intitle:receipt', 'intitle:kassenbon', 'intitle:kassabon', 'intitle:"ticket de caisse"',
  'intitle:scontrino', 'intitle:"paragon fiskalny"', 'intitle:kvitto', 'intitle:recibo', 'intitle:quittung',
  'intitle:kvittering', 'intitle:kuitti', 'intitle:účtenka', 'intitle:blokk', 'intitle:нота', 'intitle:чек',
  'intitle:レシート', 'intitle:영수증', 'intitle:小票', 'intitle:收據', 'intitle:發票', 'intitle:fatura',
  'intitle:"fiş" intitle:market', 'intitle:nota intitle:fiscal', 'intitle:cupom', 'intitle:boleta', 'intitle:tiquete',
  'intitle:struk', 'intitle:resibo', 'intitle:hóa', 'intitle:ใบเสร็จ', 'intitle:קבלה', 'intitle:إيصال', 'intitle:फ़ाइल रसीद',
];

const TITLES = path.join(ROOT, '.work/titles.json');
const DETAILS = path.join(ROOT, '.work/details.json');
await fs.mkdir(path.join(ROOT, '.work'), { recursive: true });
const readJSON = async (f, d) => { try { return JSON.parse(await fs.readFile(f, 'utf8')); } catch { return d; } };
const titles = new Set(await readJSON(TITLES, []));
for (const q of titles.size ? [] : QUERIES) {
  let off = 0;
  const before = titles.size;
  while (off < 1000) {
    const d = await api({ action: 'query', list: 'search', srsearch: `${q} filetype:bitmap`, srnamespace: '6', srlimit: '100', sroffset: String(off) });
    for (const s of d.query?.search ?? []) titles.add(s.title);
    if (!d.continue) break;
    off = d.continue.sroffset;
  }
  console.log(`${q.padEnd(36)} +${titles.size - before}`);
}
await fs.writeFile(TITLES, JSON.stringify([...titles]));
console.log('titles:', titles.size);

// Details in batches of 50: licence, author, size, categories, camera coordinates.
const OK_LIC = /^(public domain|pd|cc0|cc by(-sa)? \d|cc-by(-sa)?-\d|no restrictions|attribution$|copyrighted free use|fal|gfdl)/i;
const BAD_LIC = /\b(nc|nd)\b|noncommercial|noderiv/i;
const out = [];
const details = await readJSON(DETAILS, {}); // title -> page details, so a crash can resume
const SKIP = /ticket(?! de caisse)|fahrschein|fahrkarte|boarding|admission|lottery|banknote|cuneiform|manuscript|1[5-8]\d\d|geograph\.org|moneymuseum|\.(svg|xcf|pdf|tif)$/i;
const list = [...titles].filter((t) => !SKIP.test(t) && !(t in details));
console.log(`fetching details for ${list.length} (${Object.keys(details).length} cached)`);
for (let i = 0; i < list.length; i += 50) {
  const batch = list.slice(i, i + 50);
  const pages = {};
  let cont = {};
  for (;;) {
    const d = await api({
      action: 'query', titles: batch.join('|'), prop: 'imageinfo|categories|coordinates',
      iiprop: 'url|size|extmetadata', iiurlwidth: '1600', iiextmetadatafilter: 'LicenseShortName|LicenseUrl|Artist|Credit|DateTimeOriginal',
      cllimit: 'max', clshow: '!hidden', ...cont,
    });
    for (const p of d.query?.pages ?? []) {
      const t = (pages[p.title] ??= { title: p.title, cats: [] });
      if (p.imageinfo) t.ii = p.imageinfo[0];
      if (p.categories) t.cats.push(...p.categories.map((c) => c.title.replace(/^Category:/, '')));
      if (p.coordinates) t.coord = [p.coordinates[0].lat, p.coordinates[0].lon];
    }
    if (!d.continue) break;
    cont = d.continue;
  }
  for (const p of Object.values(pages)) details[p.title] = p;
  for (const t of batch) details[t] ??= null;
  if ((i / 50) % 10 === 0) await fs.writeFile(DETAILS, JSON.stringify(details));
  process.stdout.write(`\rdetails ${Math.min(i + 50, list.length)}/${list.length}`);
}
await fs.writeFile(DETAILS, JSON.stringify(details));
console.log();
{
  for (const p of Object.values(details)) {
    if (!p?.ii) continue;
    const md = p.ii.extmetadata ?? {};
    const lic = (md.LicenseShortName?.value ?? '').trim();
    if (!OK_LIC.test(lic) || BAD_LIC.test(lic)) continue;
    const strip = (s) => (s ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    out.push({
      title: p.title,
      url: p.ii.url,
      page: p.ii.descriptionurl,
      thumb: p.ii.thumburl,
      w: p.ii.width,
      h: p.ii.height,
      lic,
      licUrl: md.LicenseUrl?.value ?? null,
      artist: strip(md.Artist?.value),
      date: strip(md.DateTimeOriginal?.value),
      cats: p.cats,
      coord: p.coord ?? null,
    });
  }
}

// Keep things that look like modern shop receipts.
const RECEIPT_WORD = /receipt|kassenbon|kassabon|ticket de caisse|scontrino|paragon|kvitto|recibo|quittung|kvittering|kuitti|účtenka|чек|レシート|영수증|小票|收據|發票|invoice|fatura|fiş|nota fiscal|cupom|boleta|tiquete|struk|resibo|hóa đơn|ใบเสร็จ|קבלה|إيصال|bon/i;
const NOT = /ticket(?! de caisse)|fahrschein|fahrkarte|boarding|admission|bus|tram|metro|railway|station|parking|lottery|banknote|cuneiform|tablet|letter|manuscript|18\d\d|17\d\d|stamp|tax receipt|donation|geograph\.org/i;
const keep = out.filter((c) => {
  const text = c.title + ' ' + c.cats.join(' ');
  if (!RECEIPT_WORD.test(text)) return false;
  if (NOT.test(c.title)) return false;
  if (Math.max(c.w, c.h) < 900) return false; // too small to read
  return true;
});
await fs.mkdir(path.join(ROOT, '.work'), { recursive: true });
await fs.writeFile(path.join(ROOT, '.work/candidates.json'), JSON.stringify(keep, null, 1));
console.log(`licensed: ${out.length}, look like shop receipts: ${keep.length}`);
