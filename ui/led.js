// Key LED colors. The vendor app writes the color bytes as they are (QColor red/green/blue, no correction),
// and pure values look right on the LEDs (ff0000 is a true red, confirmed on the keyboard). The macOS color
// picker is color-managed (its "red" is ff2600, which shows orange), so Padturn computes colors itself from
// hue / white / brightness instead of using it.

const hex = (rgb) => "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("");

/** Color shown on the drawing for the bytes sent; null = LED off. */
export const emitted = (rgb) => (rgb.some((x) => x) ? hex(rgb) : null);

/** h 0..360, s 0..1 (0 = white), v 0..1 -> [r, g, b] bytes, no color management. */
export function hsvToRgb(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1)))); };
  return [f(5), f(3), f(1)];
}

export function rgbToHsv([r, g, b]) {
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [(h * 60 + 360) % 360, max ? d / max : 0, max / 255];
}

/** Quick picks: pure colors, in hue order, plus white and off. */
export const BASICS = [
  ["Vermelho", [255, 0, 0]], ["Laranja", [255, 128, 0]], ["Amarelo", [255, 255, 0]], ["Verde", [0, 255, 0]],
  ["Ciano", [0, 255, 255]], ["Azul", [0, 0, 255]], ["Roxo", [128, 0, 255]], ["Magenta", [255, 0, 255]],
  ["Branco", [255, 255, 255]], ["Apagada", [0, 0, 0]],
];
