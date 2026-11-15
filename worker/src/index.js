// Padturn supporter licenses on a Cloudflare Worker.
//   POST /pedido {name, email}  -> {code, token}   the app shows the code; the supporter pastes it in the Ko-fi message
//   GET  /status?code=&token=   -> {license?}      the app polls this while its sheet is open
//   POST /kofi                  (Ko-fi webhook)    finds the order by code (or e-mail), signs the license, e-mails it
import { signLicense } from "../../ui/license.js";

const MIN = { USD: 5, EUR: 5, GBP: 4, BRL: 25 }; // no currency conversion: other currencies go to the owner by e-mail
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L
const DAYS30 = 60 * 60 * 24 * 30;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "GET, POST" };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
const random = (n) => crypto.getRandomValues(new Uint8Array(n));
const newCode = () => "PT-" + [...random(6)].map((b) => ALPHABET[b % ALPHABET.length]).join("");
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
    try {
      if (req.method === "POST" && url.pathname === "/pedido") return await order(req, env);
      if (req.method === "GET" && url.pathname === "/status") return await status(url, env);
      if (req.method === "POST" && url.pathname === "/kofi") return await kofi(req, env);
      return json({ error: "not found" }, 404);
    } catch (e) {
      console.error(e);
      return json({ error: "Erro no servidor. Tente de novo em instantes." }, 500);
    }
  },
};

// shortcut: no rate limit on /pedido, orders just expire in 30 days; add Cloudflare rate limiting if it gets abused
async function order(req, env) {
  const { name = "", email = "" } = await req.json().catch(() => ({}));
  const n = String(name).trim(), e = String(email).trim().toLowerCase();
  if (!n || n.length > 80) return json({ error: "Informe seu nome (até 80 letras)." }, 400);
  if (!EMAIL.test(e) || e.length > 254) return json({ error: "Esse e-mail não parece válido." }, 400);
  let code;
  do code = newCode(); while (await env.ORDERS.get(`p:${code}`));
  const token = [...random(16)].map((b) => b.toString(16).padStart(2, "0")).join("");
  await env.ORDERS.put(`p:${code}`, JSON.stringify({ name: n, email: e, token }), { expirationTtl: DAYS30 });
  await env.ORDERS.put(`e:${e}`, code, { expirationTtl: DAYS30 });
  return json({ code, token });
}

async function status(url, env) {
  const code = url.searchParams.get("code") ?? "", token = url.searchParams.get("token") ?? "";
  const o = JSON.parse((await env.ORDERS.get(`p:${code}`)) ?? "null");
  if (!o || o.token !== token) return json({ error: "Pedido não encontrado." }, 404);
  const license = await env.ORDERS.get(`k:${code}`);
  return json(license ? { license } : {});
}

async function kofi(req, env) {
  const form = await req.formData().catch(() => null);
  const d = JSON.parse(form?.get("data") ?? "null");
  if (!d || d.verification_token !== env.KOFI_TOKEN) return json({ error: "forbidden" }, 403);
  if (d.type !== "Donation" || await env.ORDERS.get(`t:${d.kofi_transaction_id}`)) return json({ ok: true });

  const fromMsg = String(d.message ?? "").toUpperCase().match(/PT-[2-9A-HJKMNP-Z]{6}/)?.[0];
  const code = fromMsg ?? (d.email && (await env.ORDERS.get(`e:${String(d.email).toLowerCase()}`)));
  const o = code && JSON.parse((await env.ORDERS.get(`p:${code}`)) ?? "null");
  const enough = Number(d.amount) >= (MIN[d.currency] ?? Infinity);
  if (!o || !enough) {
    await mail(env, env.OWNER_EMAIL, "Padturn: doação para conferir à mão",
      `${!o ? "Não achei o pedido (sem código na mensagem e e-mail sem pedido)." : "Valor abaixo do mínimo ou moeda sem mínimo definido."}\n\n` +
      `De: ${d.from_name} <${d.email ?? "sem e-mail"}>\nValor: ${d.amount} ${d.currency}\nMensagem: ${d.message ?? ""}\nKo-fi: ${d.url}\n\n` +
      `Para emitir à mão: node tools/license.mjs sign "Nome" email`);
    return done(env, d);
  }
  const license = await signLicense({ n: o.name, e: o.email, c: code, t: new Date().toISOString() }, env.LICENSE_PRIVATE_KEY);
  await env.ORDERS.put(`k:${code}`, license, { expirationTtl: DAYS30 });
  await mail(env, o.email, "Sua chave do Padturn",
    `Oi, ${o.name}! Obrigado por apoiar o Padturn.\n\nSe o app estava aberto, o aviso já sumiu. Se não, abra o Padturn, clique em "Já tenho a chave" e cole:\n\n${license}\n`);
  return done(env, d);
}

// marked only after handling, so a crash lets Ko-fi's retry try again
async function done(env, d) {
  await env.ORDERS.put(`t:${d.kofi_transaction_id}`, "1", { expirationTtl: DAYS30 * 12 });
  return json({ ok: true });
}

async function mail(env, to, subject, text) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to, subject, text }),
  });
  if (!r.ok) console.error("resend", r.status, await r.text()); // the license is already stored, so the app still gets it
}
