import { build } from "esbuild";
import { copyFileSync, mkdirSync, readFileSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const { version: pkgVersion } = JSON.parse(readFileSync("package.json", "utf8"));
// FUR_BUILD adds a label such as "dev-1416" for test builds; release builds have none.
const version = process.env.FUR_BUILD ? `${pkgVersion}+${process.env.FUR_BUILD}` : pkgVersion;

const banner = { js: "/*! Form Update Replay - MIT License. Third-party license notices are at the end of this file and in THIRD-PARTY-NOTICES.md. */" };
const common = { bundle: true, minify: true, format: "iife", target: ["es2019"], legalComments: "eof", banner, logLevel: "info", define: { __APP_VERSION__: JSON.stringify(version) } };
// MIT and Apache-2.0 require the copyright and license texts to travel with the bundle.
const notices = readFileSync("../../THIRD-PARTY-NOTICES.md", "utf8").replace(/\*\//g, "* /");

await build({ ...common, entryPoints: ["src/library.ts"], outfile: "dist/furep.library.js" });
await build({
  ...common,
  entryPoints: ["src/ui/main.tsx"],
  outfile: "dist/furep.hub.js",
  footer: { js: `/*! Third-party notices\n${notices}\n*/` },
  define: { ...common.define, "process.env.NODE_ENV": '"production"' },
  loader: { ".woff2": "dataurl", ".woff": "dataurl" },
});
copyFileSync("src/ui/furep.hub.html", "dist/furep.hub.html");
