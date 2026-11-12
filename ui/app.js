import { MODS, MEDIA, MOUSE, MACRO_MAX, MACRO_DELAY, keyName, stepName, decode, encode, same, text, codeToUsage, modOfCode, drawKeys } from "./model.js";
import { layoutFor, ledIndex } from "./layouts.js";
import { emitted, hsvToRgb, rgbToHsv, BASICS } from "./led.js";

const invoke = window.__TAURI__?.core?.invoke ?? (async () => { throw new Error("Abra pelo app Padturn."); });
const $ = (id) => document.getElementById(id);
const ENTRIES = 25;
const PARTS = [["↺", "Girar ←"], ["●", "Apertar"], ["↻", "Girar →"]]; // entry order inside a knob (vendor app)
const PRESS = 1;

const store = (k, fallback) => { try { return JSON.parse(localStorage.getItem(k)) ?? fallback; } catch { return fallback; } };
const persist = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

// v1 drew the 12+4 board upside down; layouts are upright now, so keep what the user saw.
if (store("layoutVersion", 1) < 2) { persist("rotation", (store("rotation", 0) + 180) % 360); persist("layoutVersion", 2); }

const DEFAULT_LABELS = Object.fromEntries(
  ["DESFAZER", "COLAR ANTERIOR", "←", "→", "CONTRASTE", "COMPARAR", "PB", "COR", "REALCES", "SOMBRAS", "BRANCOS", "PRETOS"]
    .map((t, i) => [`1-${12 - i}`, t]));

const S = {
  snap: null,            // { keys, knobs, firmware, layers[l][i] -> 64 bytes, leds[l] -> {mode, rgb} | null }
  edits: new Map(),      // "layer-index" -> action
  ledEdits: new Map(),   // layer -> {mode, rgb}
  layer: 1,
  selected: null,        // entry index
  rotation: store("rotation", 0),
  labels: store("labels", DEFAULT_LABELS),
  busy: false,
  capture: null,         // null | "key" | "macro"
  layout: layoutFor(12, 4),
};
const key = (l, i) => `${l}-${i}`;
const raw = (l, i) => S.snap?.layers[l - 1][i - 1];
// drafts: kind picked in the panel but still empty (e.g. "Tecla" before a key) - shown, never written.
const drafts = new Map();
const action = (l, i) => S.edits.get(key(l, i)) ?? drafts.get(key(l, i)) ?? (raw(l, i) ? decode(raw(l, i)) : null);
const ctlOf = (i) => S.layout.controls.find((c) => c.id === i || (c.knob && i >= c.id && i <= c.id + 2));
const led = (l) => S.ledEdits.get(l) ?? S.snap?.leds?.[l - 1] ?? null;
const layerName = (l) => S.labels[`layer-${l}`] || `Camada ${l}`;
const pending = () => S.edits.size + S.ledEdits.size;
const hex = (b) => b.map((x) => x.toString(16).padStart(2, "0")).join(" ");
const rgbHex = (rgb, k) => "#" + rgb.slice(k * 3, k * 3 + 3).map((x) => x.toString(16).padStart(2, "0")).join("");

function setAction(a) { setAt(S.layer, S.selected, a); render(); }
function setAt(l, i, a) {
  const orig = decode(raw(l, i));
  const norm = (x) => (x.kind === "keys" && !x.key && !x.mods) || (x.kind === "macro" && !x.steps.length) ? { kind: "none" } : x;
  const k = key(l, i);
  drafts.delete(k);
  if (!same(norm(a), norm(orig))) S.edits.set(k, a);
  else { S.edits.delete(k); if (!same(a, orig)) drafts.set(k, a); }
}
function setLed(l, next) {
  same(next, S.snap.leds[l - 1]) ? S.ledEdits.delete(l) : S.ledEdits.set(l, next);
  render();
}

function status(msg, busy = false) { $("status").textContent = msg; $("spinner").hidden = !busy; S.busy = busy; renderToolbar(); }

async function run(msg, fn, done) {
  status(msg, true);
  try {
    const snap = await fn();
    const relayout = !S.snap || snap.keys !== S.snap.keys || snap.knobs !== S.snap.knobs;
    S.snap = snap; S.edits.clear(); S.ledEdits.clear(); drafts.clear();
    if (relayout) { S.layout = layoutFor(snap.keys, snap.knobs); S.selected = null; buildBoard(); }
    status(`${done} · ${snap.keys} teclas, ${snap.knobs} knobs, firmware ${snap.firmware}`);
  } catch (e) { status(String(e)); }
  render();
}

const readAll = () => run("Lendo o teclado…", () => invoke("read_all"), "Lido");

function save() {
  const want = [...S.edits];
  const entries = want.map(([k, a]) => { const [l, i] = k.split("-").map(Number); return encode(a, raw(l, i)); });
  if (entries.some((e) => !e)) return status("Há uma alteração que não dá para gravar; nada foi enviado.");
  const leds = [...S.ledEdits];
  run(`Gravando ${pending()} alteração(ões)…`, async () => {
    const snap = await invoke("write_entries", { entries, leds });
    want.forEach(([k], n) => {  // confirm every change really landed, byte for byte
      const [l, i] = k.split("-").map(Number);
      if (hex(snap.layers[l - 1][i - 1].slice(4)) !== hex(entries[n].slice(4)))
        throw new Error(`A tecla ${i} da camada ${l} não gravou como esperado. Um backup automático foi salvo antes de gravar.`);
    });
    leds.forEach(([l, d]) => {
      const got = snap.leds[l - 1];
      if (!got || got.mode !== d.mode || hex(got.rgb) !== hex(d.rgb)) throw new Error(`A luz da camada ${l} não gravou como esperado.`);
    });
    return snap;
  }, "Gravado e conferido");
}

// Backup: { layers: { "1": ["03 fa 01 01 ...", ...] }, leds: { "1": {mode, rgb} } }
async function exportBackup() {
  if (!S.snap) return;
  const layers = Object.fromEntries(S.snap.layers.map((rows, l) => [String(l + 1), rows.map(hex)]));
  const leds = Object.fromEntries(S.snap.leds.map((d, l) => [String(l + 1), d]).filter(([, d]) => d));
  try { if (await invoke("save_backup", { json: JSON.stringify({ layers, leds, labels: S.labels }, null, 1) })) status("Backup salvo."); }
  catch (e) { status(String(e)); }
}

async function restoreBackup() {
  let entries, leds, j;
  try {
    const txt = await invoke("open_backup");
    if (!txt) return;
    j = JSON.parse(txt);
    // accepts exported backups and the automatic ones (raw snapshot)
    const rows = Array.isArray(j.layers) ? j.layers.flat() : Object.values(j.layers).flat().map((s) => s.split(" ").map((h) => parseInt(h, 16)));
    entries = rows;
    const ledList = Array.isArray(j.leds) ? j.leds.map((d, i) => [i + 1, d]) : Object.entries(j.leds ?? {}).map(([l, d]) => [Number(l), d]);
    leds = ledList.filter(([, d]) => d && Array.isArray(d.rgb) && d.rgb.length === 48);
    const ok = entries.length === 3 * ENTRIES && entries.every((e) => e.length === 64 && e[0] === 3 && e.every((b) => b >= 0 && b <= 255));
    if (!ok) throw new Error("Arquivo de backup inválido.");
  } catch (e) { return status(String(e)); }
  if (!(await confirmSheet("Restaurar este backup?", "Tudo o que está no teclado agora será substituído. Antes, o Padturn salva uma cópia automática do estado atual.", "Restaurar"))) return;
  if (j.labels && typeof j.labels === "object") { S.labels = { ...S.labels, ...j.labels }; persist("labels", S.labels); }
  run("Restaurando backup…", () => invoke("write_entries", { entries, leds }), "Backup restaurado");
}

// ---------- board ----------

function buildBoard() {
  const board = $("board");
  board.replaceChildren();
  Object.assign(board.style, { width: `${S.layout.w}px`, height: `${S.layout.h}px` });
  for (const c of S.layout.controls) {
    const n = document.createElement("div");
    n.className = "ctl" + (c.knob ? " knob" : "") + (c.knob && c.size < 100 ? " small" : "");
    n.title = c.knob ? `Knob ${c.knob}` : `Tecla ${c.id}`;
    n.dataset.id = c.id;
    n.tabIndex = 0;
    n.setAttribute("role", "button");
    Object.assign(n.style, { left: `${c.x - c.size / 2}px`, top: `${c.y - c.size / 2}px`, width: `${c.size}px`, height: `${c.size}px` });
    n.innerHTML = c.knob
      ? `<div class="cap"></div><div class="inner"><div class="label"></div><div class="code"></div></div>`
      : `<div class="glow"></div><div class="inner"><div class="label"></div><div class="code"></div></div>`;
    const pick = () => { S.selected = c.knob ? c.id + PRESS : c.id; S.capture = null; render(); };
    n.addEventListener("click", pick);
    n.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(); } });
    board.append(n);
  }
  fitBoard(true);
}

function fitBoard(instant = false) {
  const b = $("board");
  const turned = S.rotation % 180 !== 0;
  const w = turned ? S.layout.h : S.layout.w, h = turned ? S.layout.w : S.layout.h;
  const st = $("stage").getBoundingClientRect();
  const scale = Math.min((st.width - 64) / w, (st.height - 64) / h, 1.35);
  if (instant) b.classList.add("still");
  b.style.transform = `translate(-50%, -50%) scale(${scale}) rotate(${S.rotation}deg)`;
  b.style.setProperty("--counter", `${-S.rotation}deg`);
  if (instant) requestAnimationFrame(() => requestAnimationFrame(() => b.classList.remove("still")));
}
new ResizeObserver(() => fitBoard(true)).observe($("stage"));

function renderBoard() {
  const l = led(S.layer);
  for (const n of document.querySelectorAll(".ctl")) {
    const c = S.layout.controls.find((x) => x.id === Number(n.dataset.id));
    const ids = c.knob ? [c.id, c.id + 1, c.id + 2] : [c.id];
    const label = S.labels[key(S.layer, c.id)];
    const main = action(S.layer, c.knob ? c.id + PRESS : c.id);
    n.querySelector(".label").textContent = label || text(main);
    n.querySelector(".code").textContent = c.knob
      ? `↺ ${text(action(S.layer, c.id))}  ↻ ${text(action(S.layer, c.id + 2))}`
      : label ? text(main) : "";
    n.classList.toggle("empty", !label && (!main || main.kind === "none"));
    n.classList.toggle("selected", ids.includes(S.selected));
    n.classList.toggle("edited", ids.some((i) => S.edits.has(key(S.layer, i))));
    const li = ledIndex(c);
    if (li !== null) {
      n.style.setProperty("--led", showsKeyColors(l) ? emitted(l.rgb.slice(li * 3, li * 3 + 3)) ?? "transparent" : "transparent");
      const fx = l && LED_FX[model()]?.[l.mode];
      if (fx) { n.dataset.fx = fx; n.style.setProperty("--ph", `${fx === "wave" ? -(c.x * 1.1 + c.y * 0.6) / 112 : -(c.x / 112) * 0.35}s`); } else delete n.dataset.fx;
    }
  }
}

function renderToolbar() {
  renderLightMenu();
  document.querySelectorAll("#layers button").forEach((b) => {
    b.setAttribute("aria-pressed", String(Number(b.dataset.layer) === S.layer));
    b.textContent = layerName(Number(b.dataset.layer));
  });
  const on = document.querySelector(`#layers button[data-layer="${S.layer}"]`);
  $("layers").style.setProperty("--x", `${on.offsetLeft}px`); $("layers").style.setProperty("--w", `${on.offsetWidth}px`);
  const n = pending();
  $("save").textContent = n ? `Gravar ${n}` : "Gravar";
  $("save").disabled = S.busy || !n;
  $("read").disabled = S.busy;
  $("export").disabled = !S.snap;
  $("restore").disabled = S.busy;
  $("discard").disabled = !n;
}

// ---------- inspector ----------

function el(tag, props = {}, ...kids) { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n; }
function seg(items, current, onPick, cls = "") {
  const row = el("div", { className: "chips " + cls });
  for (const [k, name, title] of items) {
    const b = el("button", { textContent: name, title: title ?? "" });
    b.setAttribute("aria-pressed", String(current === k));
    b.onclick = () => onPick(k);
    row.append(b);
  }
  return row;
}
const section = (title, ...kids) => el("section", { className: "sec" }, el("h3", { textContent: title }), ...kids);

function renderEditor() {
  const ed = $("editor");
  ed.classList.toggle("enter", ed.dataset.sel !== String(S.selected));
  ed.dataset.sel = String(S.selected);
  ed.replaceChildren();
  const i = S.selected;
  if (!S.snap) return ed.append(el("div", { className: "empty-state" }, el("div", { className: "big", textContent: "⌨︎" }),
    el("p", { textContent: "Conecte o teclado pelo cabo USB e clique em Ler." })));
  if (!i) return ed.append(el("div", { className: "empty-state" }, el("div", { className: "big", textContent: "↖︎" }),
    el("p", { textContent: "Escolha uma tecla ou knob no desenho." })), layerActions(), ledLayerSection());

  const c = ctlOf(i), a = action(S.layer, i);

  if (c.knob) ed.append(seg(PARTS.map(([sym, name], k) => [c.id + k, `${sym} ${name}`]), i, (k) => { S.selected = k; S.capture = null; render(); }, "parts"));

  const lab = el("input", { type: "text", value: S.labels[key(S.layer, c.id)] ?? "", placeholder: "Nome no desenho",
    title: "Só aparece aqui no Padturn, não vai para o teclado" });
  lab.addEventListener("input", () => {
    lab.value ? (S.labels[key(S.layer, c.id)] = lab.value) : delete S.labels[key(S.layer, c.id)];
    persist("labels", S.labels); renderBoard();
  });
  // Title and drawing name share one row: the name is a Padturn-only label, the title says what is selected.
  ed.prepend(el("header", { className: "head" },
    el("div", {}, el("div", { className: "eyebrow", textContent: layerName(S.layer) }),
      el("h2", { textContent: c.knob ? `Knob ${c.knob}` : `Tecla ${c.id}` })), lab));

  if (a.kind === "other") {
    ed.append(section("Ação", el("p", { className: "hint", textContent: `${a.what}: mantido como está.` })));
  } else {
    const kinds = [["none", "Nada"], ["keys", "Tecla"], ["media", "Mídia"], ["mouse", "Mouse"], ["macro", "Macro"]];
    const fresh = { none: { kind: "none" }, keys: { kind: "keys", mods: 0, key: 0 }, media: { kind: "media", usage: 0xcd },
      mouse: { kind: "mouse", act: "left" }, macro: { kind: "macro", steps: a.kind === "keys" && a.key ? [{ code: a.key, delay: MACRO_DELAY }] : [] } };
    ed.append(section("Ação", seg(kinds, a.kind, (k) => { S.capture = k === "keys" ? "key" : null; if (k !== a.kind) setAction(fresh[k]); else render(); }, "kinds"), editorFor(a)));
  }

  if (S.edits.has(key(S.layer, i))) ed.append(el("p", { className: "hint warn", textContent: "Alterado. Clique em Gravar para mandar ao teclado." }));
  if (!c.knob) ed.append(ledKeySection(c));
}

function editorFor(a) {
  if (a.kind === "keys") {
    const big = el("button", { className: "keyshow" + (S.capture === "key" ? " listening" : "") });
    big.append(S.capture === "key" ? el("span", { className: "listen", textContent: "Aperte a tecla ou combinação…" })
      : a.key || a.mods ? el("span", { className: "combo" }, ...MODS.filter((m) => a.mods & m.bit).map((m) => el("kbd", { textContent: m.sym })), a.key ? el("kbd", { textContent: keyName(a.key) }) : null)
      : el("span", { className: "listen", textContent: "Clique e aperte uma tecla" }));
    big.onclick = () => { S.capture = S.capture === "key" ? null : "key"; render(); };
    const mods = seg(MODS.map((m) => [m.bit, `${m.sym} ${m.name}`]), -1, (bit) => setAction({ ...a, mods: a.mods ^ bit }), "mods");
    mods.querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-pressed", String(!!(a.mods & MODS[k].bit))));
    const vk = el("button", { className: "link", textContent: "Escolher no teclado virtual…" });
    vk.onclick = () => { S.capture = null; openVirtual(a.key, (k, mods) => setAction({ ...a, key: k, mods }), false, a.mods); };
    return el("div", { className: "stack" }, big, mods, vk,
      el("p", { className: "hint", textContent: "Atalhos que o sistema intercepta (⌘Q, ⌘Tab…) só pelo teclado virtual." }));
  }
  if (a.kind === "media") return grid(MEDIA.map(([u, n]) => [u, n]), a.usage, (u) => setAction({ kind: "media", usage: u }));
  if (a.kind === "mouse") return grid(MOUSE, a.act, (act) => setAction({ kind: "mouse", act }));
  if (a.kind === "macro") return macroEditor(a);
  return el("p", { className: "hint", textContent: "Este controle não faz nada." });
}

function grid(items, current, onPick) {
  const g = el("div", { className: "grid" });
  for (const [k, name] of items) {
    const b = el("button", { textContent: name });
    b.setAttribute("aria-pressed", String(current === k));
    b.onclick = () => onPick(k);
    g.append(b);
  }
  return g;
}

function macroEditor(a) {
  const list = el("ol", { className: "steps" });
  a.steps.forEach((s, k) => {
    const name = el("button", { className: "step-key", textContent: stepName(s.code) });
    name.onclick = () => openVirtual(s.code, (code) => setAction({ ...a, steps: a.steps.map((x, j) => (j === k ? { ...x, code } : x)) }), true);
    const delay = el("input", { type: "number", min: 0, max: 5000, step: 10, value: s.delay, title: "Espera depois deste passo (ms)" });
    delay.onchange = () => setAction({ ...a, steps: a.steps.map((x, j) => (j === k ? { ...x, delay: Math.max(0, Math.min(5000, delay.valueAsNumber || 0)) } : x)) });
    const del = el("button", { className: "icon", textContent: "✕", title: "Remover passo" });
    del.onclick = () => setAction({ ...a, steps: a.steps.filter((_, j) => j !== k) });
    list.append(el("li", {}, name, el("label", { className: "ms" }, delay, el("span", { textContent: "ms" })), del));
  });
  const rec = el("button", { className: S.capture === "macro" ? "primary rec on" : "primary rec",
    textContent: S.capture === "macro" ? "■ Parar gravação" : "● Gravar passos" });
  rec.disabled = a.steps.length >= MACRO_MAX && S.capture !== "macro";
  rec.onclick = () => { S.capture = S.capture === "macro" ? null : "macro"; render(); };
  const add = el("button", { textContent: "+ Passo" });
  add.disabled = a.steps.length >= MACRO_MAX;
  add.onclick = () => openVirtual(0, (code) => setAction({ ...a, steps: [...a.steps, { code, delay: MACRO_DELAY }] }), true);
  return el("div", { className: "stack" }, a.steps.length ? list : el("p", { className: "hint", textContent: "Nenhum passo ainda." }),
    el("div", { className: "row" }, rec, add),
    el("p", { className: "hint", textContent: `Até ${MACRO_MAX} passos. Cada passo aperta uma tecla e espera o tempo indicado.` }));
}

function ledKeySection(c) {
  const l = led(S.layer), li = ledIndex(c);
  if (!l || li === null) return null;
  const cur = l.rgb.slice(li * 3, li * 3 + 3);
  const withColor = (rgb, keys) => { const next = l.rgb.slice(); for (const k of keys) next.splice(k * 3, 3, ...rgb); return { ...l, rgb: next }; };
  const put = (rgb, keys = [li]) => setLed(S.layer, withColor(rgb, keys));
  // While dragging only the board and toolbar redraw, so the dial under the pointer is not rebuilt.
  const live = (rgb) => { S.ledEdits.set(S.layer, withColor(rgb, [li])); renderBoard(); renderToolbar(); };

  const basics = el("div", { className: "led-basics" }, ...BASICS.map(([name, rgb]) => {
    const look = emitted(rgb);
    const b = el("button", { title: name, className: look ? "" : "off", style: look ? `--c:${look}` : "" });
    b.setAttribute("aria-pressed", String(cur.join() === rgb.join()));
    b.onclick = () => put(rgb);
    return b;
  }));

  let [h, sat, val] = rgbToHsv(cur);
  if (!cur.some((x) => x)) [h, sat, val] = [0, 1, 1];
  const rgbNow = () => hsvToRgb(h, sat, val);
  const knob = el("span", { className: "dial-knob" }), dot = el("span", { className: "dial-dot" });
  const dial = el("div", { className: "dial", title: "Arraste para escolher o tom" }, el("span", { className: "dial-hole" }, dot), knob);
  const white = el("input", { type: "range", min: 0, max: 100, value: Math.round((1 - sat) * 100) });
  const bright = el("input", { type: "range", min: 10, max: 100, value: Math.round(val * 100) });
  const paint = () => {
    knob.style.transform = `rotate(${h}deg)`;
    const look = emitted(rgbNow()) ?? "transparent";
    dot.style.background = look; dot.style.boxShadow = `0 0 18px 2px ${look}`;
    white.style.setProperty("--to", hsvToRgb(h, 1, 1).join(","));
  };
  const hueAt = (e) => { const r = dial.getBoundingClientRect(); return (Math.atan2(e.clientX - r.left - r.width / 2, -(e.clientY - r.top - r.height / 2)) * 180 / Math.PI + 360) % 360; };
  dial.onpointerdown = (e) => {
    dial.setPointerCapture(e.pointerId);
    const move = (ev) => { h = hueAt(ev); paint(); live(rgbNow()); };
    move(e);
    dial.onpointermove = move;
    dial.onpointerup = () => { dial.onpointermove = null; put(rgbNow()); };
  };
  white.oninput = () => { sat = 1 - white.value / 100; paint(); live(rgbNow()); };
  bright.oninput = () => { val = bright.value / 100; paint(); live(rgbNow()); };
  white.onchange = bright.onchange = () => put(rgbNow());
  paint();

  const all = el("button", { className: "link", textContent: "Usar esta cor em todas as teclas" });
  all.onclick = () => put(cur, S.layout.controls.filter((k) => !k.knob).map((k) => k.id - 1));
  return section("Luz da tecla", basics,
    el("div", { className: "dial-row" }, dial, el("div", { className: "dial-sliders" },
      el("label", {}, "Branco", white), el("label", {}, "Brilho", bright),
      el("code", { className: "dial-hex", textContent: cur.some((x) => x) ? rgbHex(l.rgb, li) : "apagada" }))),
    all,
    showsKeyColors(l) ? null : el("p", { className: "hint", textContent: `A camada está no ${ledModes()[shownMode(l.mode)]}: a cor por tecla não aparece nesse modo.` }));
}

// The vendor app only labels them "LED Mode0..5": the effect lives in each keyboard's firmware, so names are
// kept per model + firmware ("keys+knobs/fw"). Unknown keyboards get plain "Modo N".
// 12+4/fw11 names come from the user's keyboard (mode 1 shows per-key colors, mode 2 stays dark).
const LED_MODE_NAMES = { "12+4/fw11": { 1: "cores por tecla", 2: "sem luz", 3: "irradia para as teclas vizinhas", 4: "arco-íris", 5: "ondas de cor" } };
// Animated modes drawn on the board. wave = mode 5 filmed on the user's keyboard (each key a different hue,
// drifting through the rainbow, ~10 s per turn); rainbow = mode 4 filmed too (whole board cycles together,
// ~3 s per turn, slight left-to-right gradient).
const LED_FX = { "12+4/fw11": { 4: "rainbow", 5: "wave" } };
// Modes that look identical on a firmware: the alias is hidden and shown as its twin (fw11: 0 = 2, both dark).
const LED_ALIAS = { "12+4/fw11": { 0: 2 } };
const shownMode = (m) => LED_ALIAS[model()]?.[m] ?? m;
const modeList = () => [0, 1, 2, 3, 4, 5].filter((m) => !(m in (LED_ALIAS[model()] ?? {})));
// Modes that light each key with its own configured color (mode 3 radiates it to the neighbours).
const PER_KEY_MODES = { "12+4/fw11": [1, 3] };
const model = () => (S.snap ? `${S.snap.keys}+${S.snap.knobs}/fw${S.snap.firmware}` : "");
const ledModes = () => {
  const known = S.snap ? LED_MODE_NAMES[model()] ?? {} : {};
  return [0, 1, 2, 3, 4, 5].map((m) => (known[m] ? `Modo ${m} — ${known[m]}` : `Modo ${m}`));
};
// shortcut: unknown models assume only mode 1 uses per-key colors (as on the vendor's own screen).
const showsKeyColors = (l) => l != null && (PER_KEY_MODES[model()] ?? [1]).includes(l.mode);

function renderLightMenu() {
  const body = $("light-body"), l = led(S.layer);
  $("light").hidden = !S.snap;
  if (!l) { $("light-sum").replaceChildren("Iluminação"); body.replaceChildren(el("p", { className: "hint", textContent: "Este modelo não informou luz." })); return; }
  const pick = (next) => { $("light").open = false; setLed(S.layer, next); };
  const names = ledModes();
  $("light-sum").replaceChildren(swatch(shownMode(l.mode)), "Iluminação");
  $("light-sum").title = `Camada ${S.layer}: ${names[shownMode(l.mode)]}`;
  const modes = modeList().map((m) => {
    const b = el("button", { className: "with-sw" }, el("span", { className: "check", textContent: shownMode(l.mode) === m ? "✓" : "" }), swatch(m), names[m]);
    b.onclick = () => pick({ ...l, mode: m });
    return b;
  });
  const off = el("button", { textContent: "　Apagar a cor de todas as teclas" });
  off.onclick = () => pick({ ...l, rgb: l.rgb.map(() => 0) });
  body.replaceChildren(el("p", { className: "menu-title", textContent: `Iluminação da camada ${S.layer}` }), ...modes, el("hr"), off,
    el("p", { className: "hint", textContent: "A cor de cada tecla é escolhida ao clicar na tecla." }));
}

const SWATCH = { "sem luz": "#0000", "cores por tecla": "linear-gradient(90deg,#ff453a,#ffd60a,#30d158,#0a84ff)",
  "irradia para as teclas vizinhas": "radial-gradient(circle,#fff 0 25%,#0a84ff 60%,#0000 75%)",
  "arco-íris": "linear-gradient(90deg,red,orange,yellow,lime,cyan,blue,magenta)", "ondas de cor": "linear-gradient(135deg,#ff2d55,#5856d6,#34c759,#ffcc00)" };
const swatch = (m) => el("span", { className: "sw", style: `background:${SWATCH[(LED_MODE_NAMES[model()] ?? {})[m]] ?? "var(--ctrl)"}` });
function ledLayerSection() {
  const l = led(S.layer);
  if (!l) return null;
  const known = LED_MODE_NAMES[model()] ?? {};
  const list = el("div", { className: "modes-list" }, ...modeList().map((m) => {
    const name = known[m];
    const b = el("button", { title: `Modo ${m}` },
      swatch(m),
      el("span", { className: "nm", textContent: name ? name[0].toUpperCase() + name.slice(1).replace("irradia para as teclas vizinhas", "irradia para as vizinhas") : `Modo ${m}` }),
      el("span", { className: "num", textContent: String(m) }));
    b.setAttribute("aria-pressed", String(shownMode(l.mode) === m));
    b.onclick = () => setLed(S.layer, { ...l, mode: m });
    return b;
  }));
  return section(`Iluminação da camada ${S.layer}`, list,
    el("p", { className: "hint", textContent: "A cor de cada tecla fica ao clicar na tecla." }));
}

// Whole-layer actions: only pending edits, so Gravar (with its auto-backup) and Descartar still apply.
const layerIds = () => Array.from({ length: S.snap.keys + 3 * S.snap.knobs }, (_, k) => k + 1);
function applyLayer(acts) {
  layerIds().forEach((i, k) => setAt(S.layer, i, acts[k]));
  render();
  flash(S.layout.controls.map((c) => (c.knob ? c.id + PRESS : c.id)));
}
function layerActions() {
  const l = S.layer;
  const clear = el("button", { textContent: "Limpar camada", title: `Deixa todas as teclas e knobs da camada ${l} sem ação` });
  clear.onclick = async () => {
    if (await confirmSheet(`Limpar a camada ${l}?`, "Todas as teclas e knobs ficam em \"Nada\". Nada vai para o teclado até você clicar em Gravar.", "Limpar"))
      applyLayer(layerIds().map(() => ({ kind: "none" })));
  };
  const dice = el("button", { textContent: "🎲 Sortear teclas", title: "Uma tecla diferente para cada controle, ao acaso" });
  dice.onclick = async () => {
    if (!(await confirmSheet(`Sortear a camada ${l}?`, "Cada tecla e cada giro/aperto de knob recebe uma tecla diferente (F13–F24, depois com ⌃⌥⇧), sem repetir as das outras camadas. Nada vai para o teclado até você clicar em Gravar.", "Sortear"))) return;
    const used = new Set();
    for (let o = 1; o <= S.snap.layers.length; o++) if (o !== l)
      for (const i of layerIds()) { const a = action(o, i); if (a?.kind === "keys" && a.key) used.add(`${a.mods}-${a.key}`); }
    const acts = drawKeys(layerIds().length, used);
    if (acts.length < layerIds().length) return status("Não sobraram teclas livres para sortear.");
    applyLayer(acts);
  };
  const name = el("input", { type: "text", value: S.labels[`layer-${l}`] ?? "", placeholder: `Nome da camada ${l}`, maxLength: 24,
    title: "Só aparece aqui no Padturn e nos backups, não vai para o teclado" });
  name.addEventListener("input", () => {
    const v = name.value.trim();
    v ? (S.labels[`layer-${l}`] = v) : delete S.labels[`layer-${l}`];
    persist("labels", S.labels); renderToolbar();
  });
  return section(`Camada ${l}`, name, el("div", { className: "row" }, clear, dice));
}

function render() { renderToolbar(); renderBoard(); renderEditor(); }

// ---------- sheets ----------

// Virtual keyboard: ANSI layout, [usage, width in key units]; 0 = gap.
const R = (from, to) => range(from, to - from + 1).map((u) => [u, 1]);
const VK_MAIN = [
  [[0x29, 1], [0, .5], ...R(0x3a, 0x3d), [0, .5], ...R(0x3e, 0x41), [0, .5], ...R(0x42, 0x45)],
  [[0, 1.5], ...R(0x68, 0x73)],
  [[0x35, 1], ...R(0x1e, 0x27), [0x2d, 1], [0x2e, 1], [0x2a, 2]],
  [[0x2b, 1.5], ...[..."QWERTYUIOP"].map((c) => [0x04 + c.charCodeAt(0) - 65, 1]), [0x2f, 1], [0x30, 1], [0x31, 1.5]],
  [[0x39, 1.75], ...[..."ASDFGHJKL"].map((c) => [0x04 + c.charCodeAt(0) - 65, 1]), [0x33, 1], [0x34, 1], [0x28, 2.25]],
  [[0xf2, 2.25], ...[..."ZXCVBNM"].map((c) => [0x04 + c.charCodeAt(0) - 65, 1]), [0x36, 1], [0x37, 1], [0x38, 1], [0xf6, 2.75]],
  [[0xf1, 1.5], [0xf3, 1.25], [0xf4, 1.5], [0x2c, 6], [0xf8, 1.5], [0xf7, 1.25], [0xf5, 1.5]],
];
const VK_SIDE = [
  [[0x46, 1], [0x47, 1], [0x48, 1]], [[0, 1]], [[0x49, 1], [0x4a, 1], [0x4b, 1]], [[0x4c, 1], [0x4d, 1], [0x4e, 1]], [[0, 1]], [[0, 1], [0x52, 1], [0, 1]], [[0x50, 1], [0x51, 1], [0x4f, 1]],
];
const VK_PAD = [
  [[0, 1]], [[0, 1]],
  [[0x53, 1], [0x54, 1], [0x55, 1], [0x56, 1]], [[0x5f, 1], [0x60, 1], [0x61, 1], [0x57, 1]], [[0x5c, 1], [0x5d, 1], [0x5e, 1], [0, 1]],
  [[0x59, 1], [0x5a, 1], [0x5b, 1], [0x58, 1]], [[0x62, 2], [0x63, 1], [0, 1]],
];
function range(start, n) { return Array.from({ length: n }, (_, i) => start + i); }
const VK_SHORT = { 0x46: "PrtSc", 0x47: "ScrLk", 0x48: "Pause", 0x4b: "PgUp", 0x4e: "PgDn", 0x49: "Ins", 0x4c: "Del", 0x53: "Num" };
const MOD_CODE = { 0xf1: 1, 0xf2: 2, 0xf3: 4, 0xf4: 8, 0xf5: 16, 0xf6: 32, 0xf7: 64, 0xf8: 128 };

// Key mode: modifiers toggle inside the sheet and the main key closes it, onPick(key, mods).
// Macro mode (withMods): every button, modifiers included, is one step, onPick(code).
function openVirtual(current, onPick, withMods = false, mods0 = 0) {
  const dlg = el("dialog", { className: "sheet vk" });
  const close = () => dlg.close();
  let mods = mods0;
  const modButtons = [];
  const only = withMods ? null : el("button", { className: "primary" });
  const sync = () => {
    for (const [b, bit] of modButtons) b.setAttribute("aria-pressed", String(!!(mods & bit)));
    if (only) { only.disabled = !mods; only.textContent = mods ? `Usar só ${MODS.filter((m) => mods & m.bit).map((m) => m.sym).join("")}` : "Usar só modificadores"; }
  };
  const block = (rows, cls) => el("div", { className: "vk-block " + cls }, ...rows.map((row) => el("div", { className: "vk-row" }, ...row.map(([u, w]) => {
    if (!u) return el("span", { className: "gap", style: `--w:${w}` });
    const bit = MOD_CODE[u];
    const b = el("button", { textContent: bit ? stepName(u) : VK_SHORT[u] ?? keyName(u).replace(/^Num /, ""), title: `${keyName(u)} · 0x${u.toString(16)}`, style: `--w:${w}` });
    if (u >= 0x53 && u <= 0x63) b.classList.add("pad");
    if (bit && !withMods) {
      b.classList.add("mod"); modButtons.push([b, bit]);
      b.onclick = () => { mods ^= bit; sync(); };
    } else {
      b.setAttribute("aria-pressed", String(current === u));
      b.onclick = () => { close(); withMods ? onPick(u) : onPick(u, mods); };
    }
    return b;
  }))));
  dlg.append(el("h2", { textContent: "Escolher tecla" }),
    el("p", { className: "hint", textContent: withMods ? "Clique na tecla do passo." : "Marque os modificadores (⌃ ⇧ ⌥ ⌘) e clique na tecla principal." }),
    el("div", { className: "vk-wrap" }, block(VK_MAIN, "main"), block(VK_SIDE, "side"), block(VK_PAD, "numpad")));
  const cancel = el("button", { textContent: "Cancelar" }); cancel.onclick = close;
  if (only) only.onclick = () => { close(); onPick(0, mods); };
  dlg.append(el("div", { className: "foot" }, cancel, only));
  sync();
  dlg.addEventListener("close", () => setTimeout(() => dlg.remove(), 200));
  document.body.append(dlg); dlg.showModal();
}

function confirmSheet(title, body, ok) {
  return new Promise((resolve) => {
    const dlg = el("dialog", { className: "sheet confirm" });
    const yes = el("button", { className: "primary", textContent: ok }), no = el("button", { textContent: "Cancelar" });
    yes.onclick = () => { dlg.close(); resolve(true); };
    no.onclick = () => { dlg.close(); resolve(false); };
    dlg.addEventListener("cancel", () => resolve(false));
    dlg.append(el("h2", { textContent: title }), el("p", { textContent: body }), el("div", { className: "foot" }, no, yes));
    dlg.addEventListener("close", () => setTimeout(() => dlg.remove(), 200));
    document.body.append(dlg); dlg.showModal(); no.focus();
  });
}

// ---------- keyboard: capture and live highlight ----------

function flash(ids) {
  for (const i of ids) {
    const n = document.querySelector(`.ctl[data-id="${ctlOf(i).id}"]`);
    if (!n) continue;
    const part = n.classList.contains("knob") ? i - ctlOf(i).id : -1; // 0 turn left, 1 press, 2 turn right
    if (part === 0 || part === 2) {
      n._turn = (n._turn ?? 0) + (part === 2 ? 30 : -30);  // one detent, accumulates like the real knob
      n.style.setProperty("--turn", `${n._turn}deg`);
    }
    n.classList.toggle("pressed", part === 1);
    n.classList.remove("lit"); void n.offsetWidth;  // restart the ripple on repeated presses
    n.classList.add("lit"); clearTimeout(n._lit); n._lit = setTimeout(() => n.classList.remove("lit"), 650);
  }
}
// Events only say "Ctrl is down", not which side, so remember which modifier keys went down.
let sides = 0;
const heldMods = (e) => {
  let m = 0;
  for (const [flag, l] of [[e.ctrlKey, 1], [e.shiftKey, 2], [e.altKey, 4], [e.metaKey, 8]])
    if (flag) m |= sides & (l | l << 4) || l;
  return m;
};
const trackSides = (e, down) => { const m = modOfCode(e.code); if (m) sides = down ? sides | m : sides & ~m; };
window.addEventListener("keydown", (e) => trackSides(e, true), true);
window.addEventListener("keyup", (e) => trackSides(e, false), true);
window.addEventListener("blur", () => (sides = 0));
// WebKit can report keypad digits as "Digit6"; location 3 = numpad tells them apart.
const numpadCode = (e) => (e.location === 3 && /^\d$/.test(e.key) ? `Numpad${e.key}` : e.code);
let capMods = 0, lastStep = 0;
document.addEventListener("keydown", (e) => {
  if (!S.capture || e.target.closest?.("input, dialog")) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const code = numpadCode(e), a = action(S.layer, S.selected);
  if (S.capture === "macro") {
    if (e.repeat) return;
    const usage = codeToUsage(code), mod = modOfCode(code);
    const c = mod ? 0xf1 + Math.log2(mod) : usage;
    if (!c || a.steps.length >= MACRO_MAX) return;
    const now = performance.now(), steps = a.steps.slice();
    if (steps.length && lastStep) steps[steps.length - 1] = { ...steps.at(-1), delay: Math.min(5000, Math.round((now - lastStep) / 10) * 10) };
    lastStep = now;
    setAction({ ...a, steps: [...steps, { code: c, delay: MACRO_DELAY }] });
    if (a.steps.length + 1 >= MACRO_MAX) { S.capture = null; lastStep = 0; render(); }
    return;
  }
  if (modOfCode(code)) { capMods = heldMods(e) | modOfCode(code); return; }
  const usage = codeToUsage(code);
  if (!usage) return status(`Tecla não reconhecida (${code}). Use o teclado virtual.`);
  S.capture = null; capMods = 0;
  setAction({ kind: "keys", mods: heldMods(e), key: usage });
}, true);
document.addEventListener("keyup", (e) => {
  if (S.capture !== "key" || !capMods || heldMods(e)) return;
  e.preventDefault();
  const mods = capMods; S.capture = null; capMods = 0;
  setAction({ kind: "keys", mods, key: 0 });
}, true);

document.addEventListener("keydown", (e) => {
  if (!S.snap || e.target.closest?.("input, select, dialog")) return;
  const code = numpadCode(e);
  const usage = codeToUsage(code), mod = modOfCode(code);
  const hits = [];
  for (let i = 1; i <= ENTRIES; i++) {
    const a = action(S.layer, i);
    if (a?.kind === "keys" && ((usage && a.key === usage) || (mod && !a.key && a.mods === mod))) hits.push(i);
  }
  if (hits.length) { e.preventDefault(); flash(hits); }
});

// Mouse-wheel knobs send scroll, not keys: light the entries set to that direction.
let wheelAt = 0;
window.addEventListener("wheel", (e) => {
  if (!S.snap || e.target.closest?.(".editor, dialog") || Date.now() - wheelAt < 90) return;
  wheelAt = Date.now();
  const dir = e.deltaY < 0 ? "Up" : "Down", hits = [];
  for (let i = 1; i <= ENTRIES; i++) { const a = action(S.layer, i); if (a?.kind === "mouse" && a.act.endsWith(dir)) hits.push(i); }
  if (hits.length) flash(hits);
}, { passive: true });

// ---------- wiring ----------
document.body.classList.toggle("mac", /Mac/.test(navigator.platform));
document.querySelectorAll("#layers button").forEach((b) => (b.onclick = () => { S.layer = Number(b.dataset.layer); S.capture = null; render(); }));
// rotation keeps growing so the board always turns the same way; only the stored value wraps.
$("rotate").onclick = () => { S.rotation += 90; persist("rotation", S.rotation % 360); fitBoard(); };
$("read").onclick = readAll;
$("save").onclick = save;
$("export").onclick = () => { $("backup").open = false; exportBackup(); };
$("restore").onclick = () => { $("backup").open = false; restoreBackup(); };
$("discard").onclick = () => { $("backup").open = false; S.edits.clear(); S.ledEdits.clear(); drafts.clear(); render(); };
$("stage").addEventListener("click", (e) => { if (e.target === $("stage")) { S.selected = null; S.capture = null; render(); } });
document.addEventListener("click", (e) => { for (const m of ["backup", "light"]) if (!e.target.closest("#" + m)) $(m).open = false; });

buildBoard();
render();
readAll();
