// Key LED colors. The vendor app writes the color bytes as they are (QColor red/green/blue, no correction),
// and pure values look right on the LEDs (ff0000 is a true red, confirmed on the keyboard). Colors from the
// macOS picker swatches are color-managed and come out shifted (its "red" is ff2600, which shows orange),
// so the panel offers the vendor's own palette first.

const hex = (rgb) => "#" + rgb.map((x) => x.toString(16).padStart(2, "0")).join("");

/** Color shown on the drawing for the bytes sent; null = LED off. */
export const emitted = (rgb) => (rgb.some((x) => x) ? hex(rgb) : null);

// The vendor app's LED palette (stylesheets of its LED_color_* buttons), plus white and off.
const VENDOR = [[255,102,102],[0,255,0],[255,0,0],[0,255,255],[255,0,255],[255,102,0],[255,200,100],[255,85,0],[255,69,0],
  [255,192,203],[255,200,0],[128,0,0],[255,165,0],[0,0,255],[128,0,128],[255,128,60],[255,255,60],[139,0,0],[255,120,0],
  [255,255,150],[255,215,0],[255,250,100],[205,170,0],[200,255,0],[150,150,100],[150,190,100],[125,255,0],[0,0,139],
  [0,255,128],[224,255,255],[135,206,235],[75,0,130],[0,128,0],[0,127,150],[0,128,128],[230,230,250],[128,128,0],
  [0,255,127],[143,0,255],[128,255,128],[128,192,192],[173,216,230],[128,128,192],[34,139,34],[0,100,255],[0,127,255],
  [224,176,255],[0,200,100],[200,200,150],[0,139,139],[255,140,0],[57,255,20]];

const hue = ([r, g, b]) => {
  const max = Math.max(r, g, b), d = max - Math.min(r, g, b);
  if (!d) return 999;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};

/** Palette sorted by hue so similar colors sit together; white and off at the end. */
export const PALETTE = [...VENDOR.sort((a, b) => hue(a) - hue(b) || Math.max(...b) - Math.max(...a)), [255, 255, 255], [0, 0, 0]]
  .map((send) => ({ send, name: send.some((x) => x) ? hex(send) : "Apagada" }));
