#!/usr/bin/env node
// Look up an address on OpenStreetMap (Nominatim). One request per second, per their usage policy.
// Usage: node scripts/geocode.mjs "Synagoge-passage 5, 9671 ED Winschoten" ["another query" ...]
const UA = 'TillGame/0.1 (receipt geography game prototype)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
for (const q of process.argv.slice(2)) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=3&q=${encodeURIComponent(q)}`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  const d = r.ok ? await r.json() : [];
  console.log(`== ${q}`);
  if (!d.length) console.log('   (no match)');
  for (const x of d) console.log(`   ${(+x.lat).toFixed(5)}, ${(+x.lon).toFixed(5)}  [${x.addresstype}] ${x.address?.country_code?.toUpperCase()}  ${x.display_name.slice(0, 110)}`);
  await sleep(1100);
}
