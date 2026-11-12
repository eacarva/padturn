// node ui/layouts.test.mjs — every (keys, knobs) pair the vendor app has a screen for.
import assert from "node:assert/strict";
import { layoutFor } from "./layouts.js";

const MODELS = [[0, 1], [0, 2], [0, 3], [1, 0], [2, 0], [3, 0], [4, 0], [3, 1], [4, 1], [4, 2], [4, 3], [5, 0], [6, 0],
  [6, 1], [6, 2], [9, 0], [9, 2], [9, 3], [11, 3], [12, 0], [12, 2], [12, 3], [12, 4], [15, 3], [16, 0], [16, 3], [21, 1]];

for (const [keys, knobs] of MODELS) {
  const L = layoutFor(keys, knobs), tag = `${keys}+${knobs}`;
  assert.equal(L.controls.length, keys + knobs, tag);
  // ids: keys 1..K, knob n starts at K + 1 + 3n (turn left, press, turn right)
  const ids = L.controls.map((c) => c.id).sort((a, b) => a - b);
  const want = [...Array(keys)].map((_, i) => i + 1).concat([...Array(knobs)].map((_, n) => keys + 1 + 3 * n));
  assert.deepEqual(ids, want, tag);
  assert.ok(ids.at(-1) + (knobs ? 2 : 0) <= 25, `${tag}: fits in 25 entries`);
  for (const c of L.controls) {
    const r = c.size / 2;
    assert.ok(c.x - r >= 0 && c.y - r >= 0 && c.x + r <= L.w && c.y + r <= L.h, `${tag}: #${c.id} inside board`);
  }
  for (const a of L.controls) for (const b of L.controls)
    if (a !== b) assert.ok(Math.abs(a.x - b.x) >= (a.size + b.size) / 2 || Math.abs(a.y - b.y) >= (a.size + b.size) / 2, `${tag}: #${a.id} overlaps #${b.id}`);
}
console.log("layouts ok");
