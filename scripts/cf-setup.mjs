import { readFileSync, writeFileSync } from "fs";
import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const wranglerPath = path.join(root, "wrangler.jsonc");

console.log("\nTSI INV — simple Cloudflare setup\n");

const login = spawnSync("npx", ["wrangler", "login"], {
  cwd: root,
  stdio: "inherit",
  shell: true,
});
if (login.status !== 0) {
  console.error("Cloudflare login failed.");
  process.exit(1);
}

const create = spawnSync(
  "npx",
  ["wrangler", "kv", "namespace", "create", "INVENTORY_KV"],
  { cwd: root, encoding: "utf8", shell: true }
);

const output = `${create.stdout || ""}\n${create.stderr || ""}`;
console.log(output);

const match = output.match(/id\s*=\s*"([^"]+)"/i) || output.match(/"id"\s*:\s*"([^"]+)"/i);
if (!match) {
  console.error(
    "Could not find the KV id in the output.\nCreate one in the Cloudflare dashboard and paste it into wrangler.jsonc."
  );
  process.exit(1);
}

const id = match[1];
let config = readFileSync(wranglerPath, "utf8");
config = config.replace("REPLACE_WITH_KV_ID", id);
writeFileSync(wranglerPath, config, "utf8");

console.log(`\nSaved KV id to wrangler.jsonc: ${id}`);
console.log("\nNext step: npm run deploy\n");
console.log("After deploy, Cloudflare will give you a free URL like:");
console.log("  https://tsi-inv.<your-subdomain>.workers.dev\n");
