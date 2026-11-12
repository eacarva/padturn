// node ui/led.test.mjs — LED colors are written raw, like the vendor app does.
import assert from "node:assert/strict";
import { emitted, PALETTE } from "./led.js";

assert.equal(emitted([0, 0, 0]), null);              // black = off
assert.equal(emitted([255, 0, 0]), "#ff0000");       // pure red is red (confirmed on the keyboard)
assert.equal(PALETTE.length, 54);                    // 52 vendor colors + white + off
assert.deepEqual(PALETTE.at(-1).send, [0, 0, 0]);
assert.equal(new Set(PALETTE.map((p) => p.send.join())).size, PALETTE.length);
console.log("led ok");
