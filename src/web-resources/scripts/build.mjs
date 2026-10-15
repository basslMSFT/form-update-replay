import { build } from "esbuild";
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });

const banner = { js: "/*! Form Update Replay - MIT License. Third-party license notices are listed at the end of this file and in THIRD-PARTY-NOTICES.md. */" };
const common = { bundle: true, minify: true, format: "iife", target: ["es2019"], legalComments: "eof", banner, logLevel: "info" };

await build({ ...common, entryPoints: ["src/library.ts"], outfile: "dist/furep.library.js" });
await build({
  ...common,
  entryPoints: ["src/ui/main.tsx"],
  outfile: "dist/furep.hub.js",
  define: { "process.env.NODE_ENV": '"production"' },
  loader: { ".woff2": "dataurl", ".woff": "dataurl" },
});
copyFileSync("src/ui/furep.hub.html", "dist/furep.hub.html");
