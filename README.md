# Till

A daily geography game: **one real receipt, mostly blacked out. Pin where it was printed.**

- One line is free. Reveal more lines for clues (prices, tax rates, items, the footer); each costs 6% of your score.
- Drop up to 3 pins. Score is up to 1,000 for the best pin (~1,000 within a few km, ~500 at 1,000 km).
- A miss gets an arrow towards the shop (one of 8 directions), a heat word (freezing → hot) and "warmer/colder" versus your last pin. No areas or exact distances. Each extra pin costs 12%. Your closest pin counts; lock in any time.
- The shop's name and address are never revealed during play; the full receipt is shown at the end.

## Where the receipts come from

Real photos from **Wikimedia Commons**, which only hosts freely licensed files. `scripts/scrape.mjs` keeps only licences that allow both commercial use and modification:
- public domain and CC0
- CC BY and CC BY-SA

It drops anything NonCommercial or NoDerivatives.

Obligations:
- **Credit:** every puzzle shows the photographer, licence and a link to the original (footer).
- **Share-alike:** for CC BY-SA photos, our blacked-out version is a derivative, so it's shared under the same licence. The footer says so.

Personal data is pixelated permanently (card numbers, terminal IDs) via `private` rows.

## Pipeline

```bash
npm run scrape                 # Commons search (deepcat:Receipts + receipt words in ~30 languages) -> .work/candidates.json
node scripts/download.mjs .work/shortlist.json   # 1280px thumbnails -> .cache/img (slow: see below)
swift scripts/ocr.swift .work/ocr.json .cache/img/*   # Apple Vision OCR: text lines + positions
node scripts/triage.mjs 1.5    # rank by rows / prices / OCR confidence
swift scripts/sheet.swift out.jpg 9 260 .cache/img/*.jpg   # numbered contact sheet for eyeballing
node scripts/show-rows.mjs <file>   # numbered rows, to write a puzzle entry
node scripts/geocode.mjs "Lidl Aurich"   # OpenStreetMap lookup for the answer
npm run build:data             # data/receipts.json -> public/receipts/<id>/*.jpg + public/data/
npm run dev
```

### Writing a puzzle (`data/receipts.json`)

```jsonc
{
  "id": "lidl-aurich",
  "title": "File:Lidl Emsstraße receipt, Aurich (2019) 01.jpg",
  "answer": { "lat": 53.4602, "lon": 7.4966, "place": "…", "country": "Germany", "cc": "DE", "precision": "street" },
  "year": "2019",
  "segments": [[3,4,5,6,7,8,9], [10,11], …], // row groups in reveal order; the first is free. Least revealing first.
  "hidden": [0,1,2,19],     // never revealed in play: name, address, VAT/company IDs
  "private": [36],          // pixelated even at the end: card numbers, names
  "inkTop": true,           // also black out everything above the first text line (logos)
  "hiddenBoxes": [[x,y,w,h]], // extra boxes in original-image fractions, for logos elsewhere
  "note": "What gave it away…"
}
```

Some rules the build enforces, so a reveal can't leak:
- **Unassigned rows count as hidden.**
- **A segment whose rows aren't contiguous becomes several strips,** so revealing it never uncovers another segment's rows in between.
- **Photos are cropped to the text area,** so landscape shots aren't tiny.
- **Each revealable strip is a separate image file,** cut from a version with the hidden rows already inked. The page never loads the unredacted picture until the round is over.

### Wikimedia rate limits

`upload.wikimedia.org` rejects non-standard thumbnail widths and blocks the client for 10 minutes (HTTP 429, `retry-after: 600`) if you push. Rules:
- Use only standard widths: 20, 40, 60, 120, 250, 330, 500, 960, 1280, 1920 or 3840px.
- Wait 2 seconds between files.
- Stop on repeated 429s.

The downloader does all of this. A User-Agent with real contact details (an email or project URL) gets more generous limits. Add one before scaling up.

## Known gaps (MVP)

- **Small, uneven pool:** a few hundred genuine shop receipts on Commons, heavily Dutch, German, Polish and Taiwanese. Long term: Flickr CC (via Openverse) and player submissions with a licence grant.
- **Map:** MapLibre GL with OpenFreeMap vector tiles (free, no key, no usage cap), labels forced to English where OSM has them.
- **Answers are in the puzzle JSON:** a determined player can read them in devtools. Fine for a daily game; a backend could hold answers until submission.
- **Reveal order is hand-set.** It's the main difficulty dial, and real play data should tune it.
