// Donation nag: shown at launch and before Ler / Gravar until a valid supporter license is stored.
// "Agora não" always lets the action go on; the nag is annoying, never blocking.
import { verifyLicense } from "./license.js";

const WORKER = "https://padturn-licenca.contato-5ef.workers.dev";
const KOFI = "https://ko-fi.com/elissonandrade";
const MIN = "US$ 5";

const el = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids.filter((k) => k != null)); return n; };
const get = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
const set = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const openUrl = (u) => (window.__TAURI__?.opener?.openUrl ?? window.open)(u);

let owner = null; // payload of a valid license
const listeners = [];
export const supporter = () => owner;
export const onSupporter = (fn) => listeners.push(fn);

async function activate(license) {
  const p = await verifyLicense(license);
  if (!p) return false;
  owner = p; set("license", license); set("order", null);
  listeners.forEach((fn) => fn(p));
  return true;
}

async function checkOrder(order) {
  try {
    const r = await fetch(`${WORKER}/status?code=${order.code}&token=${order.token}`);
    if (r.status === 404) set("order", null); // expired
    const { license } = await r.json();
    return license ? activate(license) : false;
  } catch { return false; }
}

export async function initSupport() {
  const saved = get("license");
  if (saved && (await activate(saved))) return;
  const order = get("order"); // paid after closing the sheet: picked up on the next launch
  if (order) await checkOrder(order);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {}
  const t = el("textarea", { value: text }); document.body.append(t); t.select();
  const ok = document.execCommand("copy"); t.remove(); return ok;
}

/** Resolves when the sheet closes, whatever the user chose. */
export async function nag() {
  if (!owner && get("order")) await checkOrder(get("order"));
  if (owner) return;
  return new Promise((resolve) => {
    const dlg = el("dialog", { className: "sheet confirm support" });
    let timer = 0;
    const close = () => dlg.close();
    dlg.addEventListener("close", () => { clearInterval(timer); setTimeout(() => dlg.remove(), 200); resolve(); });
    const btn = (textContent, onclick, className = "") => el("button", { textContent, onclick, className, type: "button" });
    const view = (...kids) => { clearInterval(timer); dlg.replaceChildren(...kids); dlg.querySelector("input, textarea, .primary")?.focus(); };

    const thanks = (p) => view(
      el("h2", { textContent: `Obrigado, ${p.n}!` }),
      el("p", { textContent: "O aviso não aparece mais. Seu apoio mantém o Padturn vivo." }),
      el("div", { className: "foot" }, btn("Fechar", close, "primary")));

    const home = () => view(
      el("h2", { textContent: "O Padturn é grátis e feito por uma pessoa só" }),
      el("p", { textContent: `Se ele te ajuda, apoie com ${MIN} ou mais e este aviso some para sempre.` }),
      el("div", { className: "foot" }, btn("Já tenho a chave", haveKey, "link"), btn("Agora não", close), btn("Apoiar", () => (get("order") ? pay(get("order")) : form()), "primary")));

    const form = () => {
      const name = el("input", { type: "text", required: true, maxLength: 80, autocomplete: "name", value: get("supporterName") ?? "" });
      const email = el("input", { type: "email", required: true, maxLength: 254, autocomplete: "email", value: get("supporterEmail") ?? "" });
      const err = el("p", { className: "err", role: "alert" });
      const go = btn("Continuar no Ko-fi", null, "primary"); go.type = "submit";
      const f = el("form", {},
        el("h2", { textContent: "Apoiar o Padturn" }),
        el("p", { textContent: "A chave que tira o aviso vai para este e-mail e mostra seu nome no app. Não usamos para mais nada." }),
        el("label", {}, "Nome", name), el("label", {}, "E-mail", email), err,
        el("div", { className: "foot" }, btn("Voltar", home), go));
      f.onsubmit = async (e) => {
        e.preventDefault();
        go.disabled = true; err.textContent = "";
        try {
          const r = await fetch(`${WORKER}/pedido`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: name.value, email: email.value }) });
          const body = await r.json();
          if (!r.ok) throw Object.assign(new Error(body.error), { fromServer: true });
          set("supporterName", name.value.trim()); set("supporterEmail", email.value.trim());
          set("order", body);
          pay(body);
        } catch (x) { err.textContent = (x.fromServer && x.message) || "Sem conexão. Confira a internet e tente de novo."; go.disabled = false; }
      };
      view(f);
    };

    const pay = async (order) => {
      const code = btn(order.code, async () => { if (await copy(order.code)) { hint.textContent = "Código copiado."; } }, "code");
      code.title = "Copiar o código";
      const hint = el("p", { className: "hint" });
      const wait = el("p", { className: "wait" }, el("span", { className: "spinner" }), "Esperando o Ko-fi confirmar…");
      view(
        el("h2", { textContent: "Falta pouco" }),
        el("p", { textContent: `Na página do Ko-fi, doe ${MIN} ou mais e cole o código na mensagem. Ele já está copiado.` }),
        code, hint, wait,
        el("div", { className: "foot" }, btn("Trocar nome ou e-mail", form, "link"), btn("Abrir o Ko-fi de novo", () => openUrl(KOFI), "link"), btn("Fechar", close)));
      hint.textContent = (await copy(order.code)) ? "Código copiado. No Ko-fi, cole com ⌘V (Ctrl+V no Windows)." : "Clique no código para copiar.";
      openUrl(KOFI);
      timer = setInterval(async () => { if (await checkOrder(order)) { clearInterval(timer); thanks(owner); } }, 4000);
    };

    const haveKey = () => {
      const key = el("textarea", { rows: 4, spellcheck: false, placeholder: "Cole aqui a chave que chegou por e-mail" });
      const err = el("p", { className: "err", role: "alert" });
      view(
        el("h2", { textContent: "Ativar a chave" }), key, err,
        el("div", { className: "foot" }, btn("Voltar", home), btn("Ativar", async () => {
          if (await activate(key.value)) thanks(owner); else err.textContent = "Essa chave não confere. Copie a chave inteira do e-mail.";
        }, "primary")));
    };

    document.body.append(dlg); dlg.showModal();
    home(); // after showModal, or the dialog's autofocus wins over view()'s focus
  });
}
