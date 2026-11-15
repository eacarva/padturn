// Supporter license: base64url(JSON {n: name, e: email, c: order code, t: ISO date}) + "." + base64url(Ed25519 signature).
// Shared by the app (verify), the Cloudflare Worker and tools/license.mjs (sign), so the format lives in one place.

export const PUBLIC_KEY = "kOoHw6rdII0UhwUZ92UP6RtT15dN8Pw70tKSpkX0Lnw"; // raw Ed25519 public key, base64url (tools/license.mjs keys)

const enc = new TextEncoder();
export const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
export const unb64u = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export async function signLicense(payload, pkcs8B64u) {
  const key = await crypto.subtle.importKey("pkcs8", unb64u(pkcs8B64u), { name: "Ed25519" }, false, ["sign"]);
  const body = b64u(enc.encode(JSON.stringify(payload)));
  return `${body}.${b64u(await crypto.subtle.sign("Ed25519", key, enc.encode(body)))}`;
}

/** Returns the payload when the key is genuine, otherwise null. */
export async function verifyLicense(license, publicB64u = PUBLIC_KEY) {
  try {
    const [body, sig] = license.trim().split(".");
    const key = await crypto.subtle.importKey("raw", unb64u(publicB64u), { name: "Ed25519" }, false, ["verify"]);
    if (!(await crypto.subtle.verify("Ed25519", key, unb64u(sig), enc.encode(body)))) return null;
    return JSON.parse(new TextDecoder().decode(unb64u(body)));
  } catch { return null; }
}
