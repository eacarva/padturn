// node ui/model.test.mjs — decode/encode against packets captured from the real keyboard.
import assert from "node:assert/strict";
import { decode, encode, codeToUsage, modOfCode, text } from "./model.js";

const pkt = (s) => { const b = s.split(" ").map((h) => parseInt(h, 16)); return [...b, ...Array(64 - b.length).fill(0)]; };
const digit = pkt("03 fa 01 01 01 00 01 00 00 1e");
const shift = pkt("03 fa 11 01 01 00 01 00 00 f2 00 32 00 00 32");
const volDown = pkt("03 fa 0d 03 02 01 02 00 00 ea 00");
const mouse = pkt("03 fa 10 01 03 01 04 00 00 00 00 00 00 00 00 00 00 00 00 00 00 ff");
const lostMod = pkt("03 fa 09 02 01 00 02 00 00 00 00 00 4f");

assert.deepEqual(decode(digit), { kind: "keys", mods: 0, key: 0x1e });
assert.deepEqual(decode(shift), { kind: "keys", mods: 2, key: 0 });
assert.deepEqual(decode(volDown), { kind: "media", usage: 0xea });
assert.deepEqual(decode(mouse), { kind: "mouse", act: "wheelDown" });
assert.deepEqual(decode(lostMod), { kind: "keys", mods: 0, key: 0x4f });
assert.deepEqual(encode(decode(digit), digit), digit);
assert.deepEqual(encode(decode(volDown), volDown), volDown);
const combo = encode({ kind: "keys", mods: 8 | 2, key: 0x68 }, digit);
assert.deepEqual(combo.slice(4, 16), [1, 0, 3, 0, 0, 0xf2, 0, 0, 0xf4, 0, 0, 0x68]);
assert.deepEqual(decode(combo), { kind: "keys", mods: 10, key: 0x68 });
assert.deepEqual(encode(decode(mouse), mouse), mouse);
for (const act of ["left", "right", "middle", "wheelUp", "ctrlDown", "altUp", "like", "swipeD"])
  assert.deepEqual(decode(encode({ kind: "mouse", act }, mouse)), { kind: "mouse", act });
const macro = { kind: "macro", steps: [{ code: 0xf1, delay: 50 }, { code: 0x06, delay: 0 }, { code: 0x19, delay: 300 }] };
const mb = encode(macro, digit);
assert.deepEqual(mb.slice(4, 18), [1, 0, 3, 0, 0, 0xf1, 0, 50, 0x06, 0, 0, 0x19, 1, 44]);
assert.deepEqual(decode(mb), macro);
assert.equal(encode({ kind: "macro", steps: Array(19).fill({ code: 4, delay: 0 }) }, digit), null);
// shift-only knob press read from the device (items carry the vendor's 50 ms default)
assert.deepEqual(decode(shift), { kind: "keys", mods: 2, key: 0 });
assert.equal(codeToUsage("Digit1"), 0x1e);
assert.equal(codeToUsage("Digit0"), 0x27);
assert.equal(codeToUsage("Numpad1"), 0x59);
assert.equal(codeToUsage("Numpad0"), 0x62);
assert.equal(codeToUsage("F13"), 0x68);
assert.equal(codeToUsage("ArrowLeft"), 0x50);
// Right-side modifiers: F5..F8 (vendor Traversal_Key_Txt).
const rk = encode({ kind: "keys", mods: 16 | 2, key: 0x0e }, digit); // Right Ctrl + Shift + K
assert.deepEqual(rk.slice(4, 18), [1, 0, 3, 0, 0, 0xf2, 0, 0, 0xf5, 0, 0, 0x0e, 0, 0]);
assert.deepEqual(decode([3, 0xfa, 1, 1, ...rk.slice(4)]), { kind: "keys", mods: 18, key: 0x0e });
assert.equal(modOfCode("MetaRight"), 128);
assert.match(text(decode([3, 0xfa, 1, 1, ...encode({ kind: "keys", mods: 128, key: 0 }, digit).slice(4)])), /R⌘/);
console.log("model ok");
