// rtmlib-ts loads MediaPipe's WASM from "@latest" while bundling a fixed JS
// version; pin the URL to the version npm installs so the two never drift.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "node_modules/rtmlib-ts/dist";
let version;
try {
  version = JSON.parse(readFileSync("node_modules/@mediapipe/tasks-vision/package.json", "utf8")).version;
} catch {
  process.exit(0); // dependency not installed (e.g. partial install)
}
let patched = 0;
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith(".js")) {
      const src = readFileSync(p, "utf8");
      const out = src.replaceAll("@mediapipe/tasks-vision@latest/", `@mediapipe/tasks-vision@${version}/`);
      if (out !== src) {
        writeFileSync(p, out);
        patched++;
      }
    }
  }
};
try {
  walk(root);
} catch {
  process.exit(0);
}
console.log(`patch-rtmlib: pinned MediaPipe WASM to ${version} in ${patched} file(s)`);
