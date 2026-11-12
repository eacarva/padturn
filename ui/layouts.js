// Board layouts in the vendor's upright orientation (keys left, knobs right; key 1 top-left).
// The keyboard reports how many keys and knobs it has (03 FB reply); the vendor app picks one of ~30
// hand-made screens from that pair. Entry numbering is always: keys 1..K, then 3 entries per knob
// (turn left, press, turn right).
//
// 12 keys + 4 knobs is measured from the vendor app; every other model gets a computed layout in the
// same style. shortcut: knob order for models other than 12+4 assumes "first knob = largest", like
// 12+4; confirm with the live highlight when someone has one of those models.

const PITCH = 112, KEY = 100, M = 50;
const COLS = { 6: 3, 9: 3, 11: 4, 12: 4, 15: 5, 16: 4, 21: 7 };

function grid(keys, x0, y0) {
  const cols = keys <= 5 ? keys : COLS[keys] ?? Math.ceil(Math.sqrt(keys * 1.6));
  const out = [];
  for (let i = 0; i < keys; i++)
    out.push({ id: i + 1, x: x0 + (i % cols) * PITCH + KEY / 2, y: y0 + Math.floor(i / cols) * PITCH + KEY / 2, size: KEY });
  return { out, w: Math.min(keys, cols) * PITCH - (PITCH - KEY), h: Math.ceil(keys / cols) * PITCH - (PITCH - KEY) };
}

const knob = (keys, n, x, y, size) => ({ id: keys + 1 + n * 3, knob: n + 1, x, y, size });

function measured12x4() {
  const { out } = grid(12, M, 46);
  return {
    w: 800, h: 430,
    controls: [
      ...out,
      knob(12, 0, 640, 335, 140), // big, bottom
      knob(12, 1, 568, 72, 82),   // small, top-left (16-18)
      knob(12, 2, 712, 72, 82),   // small, top-right (19-21)
      knob(12, 3, 640, 200, 112), // medium, middle (22-24)
    ],
  };
}

function computed(keys, knobs) {
  const g = grid(keys, M, M);
  const controls = [...g.out];
  let kw = 0, kh = 0;
  const x0 = keys ? M + g.w + 60 : M;
  if (knobs === 1) { kw = kh = 150; controls.push(knob(keys, 0, x0 + 75, M + 75, 150)); }
  else if (knobs === 2) {
    kw = 120; kh = 2 * 120 + 24;
    for (let n = 0; n < 2; n++) controls.push(knob(keys, n, x0 + 60, M + 60 + n * 144, 120));
  } else if (knobs >= 3) {
    const small = knobs - 1, rows = Math.ceil(small / 2);
    kw = 200; kh = rows * 100 + 150;
    for (let n = 1; n < knobs; n++) {
      const r = Math.floor((n - 1) / 2), c = (n - 1) % 2;
      controls.push(knob(keys, n, x0 + 45 + c * 110, M + 45 + r * 100, 86));
    }
    controls.push(knob(keys, 0, x0 + 100, M + rows * 100 + 70, 140));
  }
  const w = (keys ? g.w : 0) + (knobs ? kw + (keys ? 60 : 0) : 0) + 2 * M;
  const h = Math.max(keys ? g.h : 0, kh) + 2 * M;
  // centre the shorter column vertically
  const off = (part, ph) => part.forEach((c) => (c.y += (h - 2 * M - ph) / 2));
  off(controls.filter((c) => !c.knob), keys ? g.h : 0);
  off(controls.filter((c) => c.knob), kh);
  return { w, h, controls };
}

export function layoutFor(keys, knobs) {
  return keys === 12 && knobs === 4 ? measured12x4() : computed(keys, knobs);
}

/** Entry index of each LED triple: keys first, then one ring per knob (vendor sends 16 triples). */
export const ledIndex = (c) => (c.knob ? null : c.id - 1);
