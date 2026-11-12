// Entry layout (64 bytes, as read): 03 FA idx layer type flag n 00 00 items...
// item i = 3 bytes starting at 9 + 3*i, code in the first byte.
// Modifiers are pseudo-keys 0xF1 + bit index (vendor Traversal_Key_Txt: F1 Ctrl, F2 Shift, F3 Alt, F4 Win,
// F5..F8 the same on the right side).

export const MODS = [
  { bit: 1, sym: "⌃", name: "Ctrl" },
  { bit: 4, sym: "⌥", name: "Alt/Option" },
  { bit: 2, sym: "⇧", name: "Shift" },
  { bit: 8, sym: "⌘", name: "Cmd/Win" },
  { bit: 16, sym: "R⌃", name: "Ctrl dir." },
  { bit: 64, sym: "R⌥", name: "Alt dir." },
  { bit: 32, sym: "R⇧", name: "Shift dir." },
  { bit: 128, sym: "R⌘", name: "Cmd dir." },
];
const isMod = (c) => c >= 0xf1 && c <= 0xf8;

// Same 21 consumer-page actions the vendor app offers (HID usage page 0x0C).
export const MEDIA = [
  [0xcd, "Play/Pause"], [0xb5, "Próxima faixa"], [0xb6, "Faixa anterior"], [0xb7, "Parar"],
  [0xe9, "Volume +"], [0xea, "Volume −"], [0xe2, "Mudo"],
  [0x6f, "Brilho da tela +"], [0x70, "Brilho da tela −"],
  [0x152, "Graves +"], [0x153, "Graves −"], [0x154, "Agudos +"], [0x155, "Agudos −"],
  [0x183, "Abrir player de mídia"], [0x192, "Calculadora"], [0x194, "Meu computador"], [0x18a, "E-mail"],
  [0x223, "Navegador: início"], [0x224, "Navegador: voltar"], [0x225, "Navegador: avançar"], [0x227, "Navegador: recarregar"],
];

// Mouse entries (type 3): item0 = modifier pseudo-key, item1 = buttons (1 L, 2 R, 4 M), item4 = wheel (1 up, 0xFF down).
// Gestures use flag 4 and item0 = 1..5.
export const MOUSE = [
  ["left", "Clique esquerdo"], ["right", "Clique direito"], ["middle", "Clique do meio"],
  ["wheelUp", "Rolar ↑"], ["wheelDown", "Rolar ↓"],
  ["ctrlUp", "⌃ Rolar ↑"], ["ctrlDown", "⌃ Rolar ↓"],
  ["shiftUp", "⇧ Rolar ↑"], ["shiftDown", "⇧ Rolar ↓"],
  ["altUp", "⌥ Rolar ↑"], ["altDown", "⌥ Rolar ↓"],
  ["like", "Curtir (toque duplo)"], ["swipeL", "Deslizar ←"], ["swipeR", "Deslizar →"], ["swipeU", "Deslizar ↑"], ["swipeD", "Deslizar ↓"],
];
const BUTTONS = { left: 1, right: 2, middle: 4 };
const WHEEL_MOD = { "": 0, ctrl: 0xf1, shift: 0xf2, alt: 0xf3 };
const GESTURES = ["like", "swipeL", "swipeR", "swipeU", "swipeD"];
export const MACRO_MAX = 18, MACRO_DELAY = 50;

export const KEY_NAMES = (() => {
  const d = {};
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").forEach((c, i) => (d[0x04 + i] = c));
  "1234567890".split("").forEach((c, i) => (d[0x1e + i] = c));
  Object.assign(d, {
    0x28: "Enter", 0x29: "Esc", 0x2a: "Backspace", 0x2b: "Tab", 0x2c: "Espaço",
    0x2d: "-", 0x2e: "=", 0x2f: "[", 0x30: "]", 0x31: "\\", 0x33: ";", 0x34: "'", 0x35: "`",
    0x36: ",", 0x37: ".", 0x38: "/", 0x39: "Caps Lock", 0x46: "Print Screen", 0x47: "Scroll Lock",
    0x48: "Pause", 0x49: "Insert", 0x4a: "Home", 0x4b: "Page Up", 0x4c: "Delete", 0x4d: "End",
    0x4e: "Page Down", 0x4f: "→", 0x50: "←", 0x51: "↓", 0x52: "↑", 0x53: "Num Lock",
    0x54: "Num /", 0x55: "Num *", 0x56: "Num −", 0x57: "Num +", 0x58: "Num Enter",
    0x62: "Num 0", 0x63: "Num .",
  });
  for (let i = 0; i < 12; i++) { d[0x3a + i] = `F${i + 1}`; d[0x68 + i] = `F${i + 13}`; }
  for (let i = 0; i < 9; i++) d[0x59 + i] = `Num ${i + 1}`;
  return d;
})();

export const keyName = (k) => KEY_NAMES[k] ?? `0x${k.toString(16).padStart(2, "0").toUpperCase()}`;

/** @returns {{kind:'none'}|{kind:'keys',mods,key}|{kind:'media',usage}|{kind:'mouse',act}|{kind:'macro',steps:{code,delay}[]}|{kind:'other',what}} */
export function decode(r) {
  const n = Math.min(r[6], MACRO_MAX);
  if (r[4] === 1) {
    const steps = Array.from({ length: n }, (_, i) => ({ code: r[9 + 3 * i], delay: (r[10 + 3 * i] << 8) | r[11 + 3 * i] }));
    const keys = steps.filter((s) => s.code && !isMod(s.code));
    if (keys.length > 1) return { kind: "macro", steps };
    let mods = 0;
    for (const s of steps) if (isMod(s.code)) mods |= 1 << (s.code - 0xf1);
    const key = keys[0]?.code ?? 0;
    return key || mods ? { kind: "keys", mods, key } : { kind: "none" };
  }
  if (r[4] === 2) return { kind: "media", usage: r[9] | (r[10] << 8) };
  if (r[4] === 3) {
    if (r[5] === 4 && r[9] >= 1 && r[9] <= 5) return { kind: "mouse", act: GESTURES[r[9] - 1] };
    const btn = Object.keys(BUTTONS).find((k) => BUTTONS[k] === r[12]);
    if (btn && !r[21]) return { kind: "mouse", act: btn };
    const mod = Object.keys(WHEEL_MOD).find((k) => WHEEL_MOD[k] === r[9]);
    if (!r[12] && mod !== undefined && (r[21] === 1 || r[21] === 0xff))
      return { kind: "mouse", act: (mod || "wheel") + (r[21] === 1 ? "Up" : "Down") };
    return { kind: "other", what: "Mouse (personalizado)" };
  }
  return { kind: "other", what: `Tipo ${r[4]}` };
}

/** Bytes for `a`, keeping the header (index, layer) and, for keys/media, the flag of `base`. null = not encodable. */
export function encode(a, base) {
  const r = base.slice();
  r.fill(0, 6);
  const put = (i, code, delay = 0) => { r[9 + 3 * i] = code; r[10 + 3 * i] = delay >> 8; r[11 + 3 * i] = delay & 0xff; };
  if (a.kind === "none") { r[4] = 1; } // n = 0, like the firmware's own empty entries
  else if (a.kind === "keys") {
    const codes = [0, 1, 2, 3, 4, 5, 6, 7].filter((b) => a.mods & (1 << b)).map((b) => 0xf1 + b);
    if (a.key) codes.push(a.key);
    r[4] = 1; r[6] = codes.length;
    codes.forEach((c, i) => put(i, c));
  } else if (a.kind === "macro") {
    if (!a.steps.length || a.steps.length > MACRO_MAX) return null;
    r[4] = 1; r[6] = a.steps.length;
    a.steps.forEach((s, i) => put(i, s.code, Math.max(0, Math.min(0xffff, s.delay | 0))));
  } else if (a.kind === "media") { r[4] = 2; r[6] = 2; r[9] = a.usage & 0xff; r[10] = a.usage >> 8; }
  else if (a.kind === "mouse") {
    r[4] = 3; r[6] = 4;
    const g = GESTURES.indexOf(a.act);
    if (g >= 0) { r[5] = 4; r[9] = g + 1; }
    else if (BUTTONS[a.act]) { r[5] = 1; r[12] = BUTTONS[a.act]; }
    else {
      const m = a.act.match(/^(wheel|ctrl|shift|alt)(Up|Down)$/);
      if (!m) return null;
      r[5] = 1; r[9] = WHEEL_MOD[m[1] === "wheel" ? "" : m[1]]; r[21] = m[2] === "Up" ? 1 : 0xff;
    }
  }
  else return null;
  return r;
}

export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function text(a) {
  if (!a || a.kind === "none") return "—";
  if (a.kind === "keys") {
    const m = MODS.filter((x) => a.mods & x.bit).map((x) => x.sym).join("");
    return m + (a.key ? keyName(a.key) : "");
  }
  if (a.kind === "media") return MEDIA.find(([u]) => u === a.usage)?.[1] ?? `Mídia ${a.usage.toString(16)}`;
  if (a.kind === "mouse") return MOUSE.find(([k]) => k === a.act)?.[1] ?? "Mouse";
  if (a.kind === "macro") return a.steps.map((s) => stepName(s.code)).join(" ");
  return a.what;
}

export const stepName = (c) => (isMod(c) ? MODS.find((m) => m.bit === 1 << (c - 0xf1)).sym : c ? keyName(c) : "·");

// KeyboardEvent.code -> HID usage (page 7), to light up the key the user pressed.
export function codeToUsage(code) {
  let m;
  if ((m = code.match(/^Key([A-Z])$/))) return 0x04 + m[1].charCodeAt(0) - 65;
  if ((m = code.match(/^Digit(\d)$/))) return m[1] === "0" ? 0x27 : 0x1d + Number(m[1]);
  if ((m = code.match(/^F(\d+)$/))) { const f = Number(m[1]); return f <= 12 ? 0x39 + f : 0x67 + (f - 12); }
  if ((m = code.match(/^Numpad(\d)$/))) return m[1] === "0" ? 0x62 : 0x58 + Number(m[1]);
  return {
    Enter: 0x28, Escape: 0x29, Backspace: 0x2a, Tab: 0x2b, Space: 0x2c, Minus: 0x2d, Equal: 0x2e,
    BracketLeft: 0x2f, BracketRight: 0x30, Backslash: 0x31, Semicolon: 0x33, Quote: 0x34,
    Backquote: 0x35, Comma: 0x36, Period: 0x37, Slash: 0x38, CapsLock: 0x39, Insert: 0x49,
    Home: 0x4a, PageUp: 0x4b, Delete: 0x4c, End: 0x4d, PageDown: 0x4e, ArrowRight: 0x4f,
    ArrowLeft: 0x50, ArrowDown: 0x51, ArrowUp: 0x52, NumLock: 0x53, NumpadDivide: 0x54,
    NumpadMultiply: 0x55, NumpadSubtract: 0x56, NumpadAdd: 0x57, NumpadEnter: 0x58, NumpadDecimal: 0x63,
  }[code];
}

export const modOfCode = (code) =>
  ({ ControlLeft: 1, ControlRight: 16, ShiftLeft: 2, ShiftRight: 32, AltLeft: 4, AltRight: 64, MetaLeft: 8, MetaRight: 128 })[code] ?? 0;

/** n distinct random key actions for a whole layer. F13–F24 alone first, then with ⌃/⌥/⇧ combos.
 * used: Set of "mods-key" already taken elsewhere (other layers), so the remapper never sees a clash. */
export function drawKeys(n, used = new Set(), rand = Math.random) {
  const out = [];
  for (const mods of [0, 1, 4, 2, 5, 3, 6, 7]) {  // none, ⌃, ⌥, ⇧, ⌃⌥, ⌃⇧, ⌥⇧, ⌃⌥⇧
    const tier = [];
    for (let k = 0x68; k <= 0x73; k++) if (!used.has(`${mods}-${k}`)) tier.push({ kind: "keys", mods, key: k });
    for (let j = tier.length - 1; j > 0; j--) { const r = Math.floor(rand() * (j + 1)); [tier[j], tier[r]] = [tier[r], tier[j]]; }
    out.push(...tier);
    if (out.length >= n) break;
  }
  return out.slice(0, n);
}
