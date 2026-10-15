import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

// Copies the freshly built bundles over the web resource files inside the unpacked solution, so the packed solution
// always contains exactly what the build produced.
const dist = "src/web-resources/dist";
const assets = "src/web-resources/assets";
const root = "src/solution/WebResources/msftnl_/furep";
const map = [
  [join(dist, "furep.library.js"), join(root, "js", "furep.library.js")],
  [join(dist, "furep.hub.js"), join(root, "js", "furep.hub.js")],
  [join(dist, "furep.hub.html"), join(root, "html", "furep.hub.html")],
  [join(assets, "furep.svg"), join(root, "img", "furep.svg")],
];

for (const [from, to] of map) {
  if (!existsSync(from)) { console.error(`Missing build output: ${from}`); process.exit(1); }
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log(`${from} -> ${to}`);
}
