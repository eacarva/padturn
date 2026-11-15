import assert from "node:assert/strict";
import { signLicense, verifyLicense, b64u } from "./license.js";

const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
const pub = b64u(await crypto.subtle.exportKey("raw", publicKey));
const priv = b64u(await crypto.subtle.exportKey("pkcs8", privateKey));

const lic = await signLicense({ n: "Ana Lima", e: "ana@example.com", c: "PT-ABC234", t: "2026-11-15T00:00:00Z" }, priv);
assert.equal((await verifyLicense(lic, pub)).n, "Ana Lima");
assert.equal((await verifyLicense(`  ${lic}\n`, pub)).e, "ana@example.com", "pasted with spaces");

const [body, sig] = lic.split(".");
const forged = b64u(new TextEncoder().encode(JSON.stringify({ n: "Outro", e: "x@y.z", c: "PT-ABC234", t: "2026-11-15T00:00:00Z" })));
assert.equal(await verifyLicense(`${forged}.${sig}`, pub), null, "changed name");
const flip = sig[10] === "A" ? "B" : "A"; // not the last char: its low bits are ignored by base64
assert.equal(await verifyLicense(`${body}.${sig.slice(0, 10)}${flip}${sig.slice(11)}`, pub), null, "changed signature");
assert.equal(await verifyLicense("lixo", pub), null);
assert.equal(await verifyLicense("", pub), null);
console.log("license ok");
