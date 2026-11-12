// node ui/led.test.mjs — LED colors are computed and written raw, like the vendor app does.
import assert from "node:assert/strict";
import { emitted, hsvToRgb, rgbToHsv, BASICS } from "./led.js";

assert.equal(emitted([0, 0, 0]), null);                   // black = off
assert.equal(emitted([255, 0, 0]), "#ff0000");           // pure red is red (confirmed on the keyboard)
assert.deepEqual(hsvToRgb(0, 1, 1), [255, 0, 0]);
assert.deepEqual(hsvToRgb(120, 1, 1), [0, 255, 0]);
assert.deepEqual(hsvToRgb(240, 0, 1), [255, 255, 255]);   // no saturation = white
for (const [, rgb] of BASICS.slice(0, 8)) assert.deepEqual(hsvToRgb(...rgbToHsv(rgb)), rgb); // round trip
console.log("led ok");
