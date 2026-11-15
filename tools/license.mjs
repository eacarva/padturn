// node tools/license.mjs keys                      -> new key pair: public key goes in ui/license.js, private key in worker/.dev.vars
// node tools/license.mjs sign "Nome" email [código] -> a license by hand (e.g. a Ko-fi payment without code or e-mail)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { signLicense, verifyLicense, b64u } from "../ui/license.js";

const VARS = new URL("../worker/.dev.vars", import.meta.url);
const [cmd, ...args] = process.argv.slice(2);

if (cmd === "keys") {
  if (existsSync(VARS) && readFileSync(VARS, "utf8").includes("LICENSE_PRIVATE_KEY")) {
    console.error("worker/.dev.vars já tem uma chave privada. Trocar invalida todas as licenças já emitidas; apague à mão se for isso mesmo.");
    process.exit(1);
  }
  const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const pub = b64u(await crypto.subtle.exportKey("raw", publicKey));
  const priv = b64u(await crypto.subtle.exportKey("pkcs8", privateKey));
  mkdirSync(new URL(".", VARS), { recursive: true });
  writeFileSync(VARS, `LICENSE_PRIVATE_KEY=${priv}\n`, { flag: "a" }); // private first: a public key without its pair is useless
  const libPath = new URL("../ui/license.js", import.meta.url);
  writeFileSync(libPath, readFileSync(libPath, "utf8").replace(/PUBLIC_KEY = "[^"]*"/, `PUBLIC_KEY = "${pub}"`));
  console.log(`Chave pública gravada em ui/license.js: ${pub}\nChave privada gravada em worker/.dev.vars (fora do git). Guarde uma cópia: sem ela não dá para emitir licenças.`);
} else if (cmd === "sign" && args.length >= 2) {
  const priv = readFileSync(VARS, "utf8").match(/LICENSE_PRIVATE_KEY=(\S+)/)?.[1];
  if (!priv) { console.error("Sem LICENSE_PRIVATE_KEY em worker/.dev.vars."); process.exit(1); }
  const [n, e, c = "manual"] = args;
  const lic = await signLicense({ n, e, c, t: new Date().toISOString() }, priv);
  if (!(await verifyLicense(lic))) { console.error("A licença gerada não confere com a chave pública do app."); process.exit(1); }
  console.log(lic);
} else {
  console.log('Uso: node tools/license.mjs keys | sign "Nome" email [código]');
}
