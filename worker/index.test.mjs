// node worker/index.test.mjs: whole flow with an in-memory KV and a fake Resend.
import assert from "node:assert/strict";
import worker from "./src/index.js";
import { verifyLicense, b64u } from "../ui/license.js";

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const pub = b64u(await crypto.subtle.exportKey("raw", publicKey));
const kv = new Map();
const env = {
  ORDERS: { get: async (k) => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v) },
  KOFI_TOKEN: "tok", RESEND_API_KEY: "re", MAIL_FROM: "Padturn <p@x.y>", OWNER_EMAIL: "dono@x.y",
  LICENSE_PRIVATE_KEY: b64u(await crypto.subtle.exportKey("pkcs8", privateKey)),
};
const mails = [];
globalThis.fetch = async (_u, o) => { mails.push(JSON.parse(o.body)); return new Response("{}"); };
const call = (path, init) => worker.fetch(new Request(`https://w.dev${path}`, init), env);
const kofi = (d) => call("/kofi", { method: "POST", body: new URLSearchParams({ data: JSON.stringify({ verification_token: "tok", type: "Donation", currency: "USD", amount: "5.00", kofi_transaction_id: crypto.randomUUID(), ...d }) }) });

// invalid order input
assert.equal((await call("/pedido", { method: "POST", body: JSON.stringify({ name: "", email: "a@b.c" }) })).status, 400);
assert.equal((await call("/pedido", { method: "POST", body: JSON.stringify({ name: "Ana", email: "nope" }) })).status, 400);

const { code, token } = await (await call("/pedido", { method: "POST", body: JSON.stringify({ name: "Ana", email: "Ana@Example.com" }) })).json();
assert.match(code, /^PT-[2-9A-HJKMNP-Z]{6}$/);
assert.equal((await call(`/status?code=${code}&token=errado`)).status, 404, "token required");
assert.deepEqual(await (await call(`/status?code=${code}&token=${token}`)).json(), {}, "not paid yet");

assert.equal((await kofi({ verification_token: "x", message: code })).status, 403, "forged webhook");
await kofi({ message: `valeu! ${code.toLowerCase()}`, amount: "3.00" });
assert.equal(mails.at(-1).to, "dono@x.y", "below minimum goes to the owner");
assert.deepEqual(await (await call(`/status?code=${code}&token=${token}`)).json(), {});

const tx = crypto.randomUUID();
await kofi({ message: `valeu! ${code.toLowerCase()}`, kofi_transaction_id: tx });
const { license } = await (await call(`/status?code=${code}&token=${token}`)).json();
const p = await verifyLicense(license, pub);
assert.equal(p.n, "Ana"); assert.equal(p.e, "ana@example.com"); assert.equal(p.c, code);
assert.equal(mails.at(-1).to, "ana@example.com");
const sent = mails.length;
await kofi({ message: code, kofi_transaction_id: tx });
assert.equal(mails.length, sent, "Ko-fi retry is ignored");

// no code in the message: matched by e-mail
const o2 = await (await call("/pedido", { method: "POST", body: JSON.stringify({ name: "Bia", email: "bia@x.y" }) })).json();
await kofi({ message: "", email: "BIA@x.y", currency: "BRL", amount: "25" });
assert.ok((await (await call(`/status?code=${o2.code}&token=${o2.token}`)).json()).license);

// nothing to match
await kofi({ message: "oi", email: "ninguem@x.y" });
assert.equal(mails.at(-1).to, "dono@x.y");
console.log("worker ok");
