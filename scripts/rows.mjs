// Shared helper: turn OCR observations into numbered rows, top to bottom.
// Vision often splits one printed line ("MILK ...... 1.29") into two observations; rows merge them.

export function rows(ocr) {
  const obs = ocr.lines
    .filter((l) => l.t.trim())
    .map((l) => ({ ...l, cy: l.b[1] + l.b[3] / 2 }))
    .sort((a, b) => a.cy - b.cy);
  const out = [];
  for (const o of obs) {
    const r = out.at(-1);
    const hgt = Math.min(o.b[3], r ? r.h : 1);
    if (r && Math.abs(o.cy - r.cy) < hgt * 0.55) {
      r.parts.push(o);
      r.x0 = Math.min(r.x0, o.b[0]);
      r.x1 = Math.max(r.x1, o.b[0] + o.b[2]);
      r.y0 = Math.min(r.y0, o.b[1]);
      r.y1 = Math.max(r.y1, o.b[1] + o.b[3]);
      r.cy = (r.y0 + r.y1) / 2;
      r.h = r.y1 - r.y0;
    } else {
      out.push({ parts: [o], x0: o.b[0], x1: o.b[0] + o.b[2], y0: o.b[1], y1: o.b[1] + o.b[3], cy: o.cy, h: o.b[3] });
    }
  }
  for (const r of out) {
    r.parts.sort((a, b) => a.b[0] - b.b[0]);
    r.text = r.parts.map((p) => p.t).join('  ');
    r.conf = Math.min(...r.parts.map((p) => p.c));
  }
  return out;
}

/** Local file name for a Commons file title. */
export const imgName = (title) => title.replace(/^File:/, '').replace(/[^\p{L}\p{N}._-]+/gu, '_').replace(/\.(png|tiff?|gif|webp)$/i, '.jpg');
