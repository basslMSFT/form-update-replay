import { readFileSync } from "node:fs";

// Fails when package-lock.json resolves packages from anything but the public npm registry. A machine configured with
// a private mirror writes the mirror's URLs into the lockfile the next time a package is added.
const lock = readFileSync("src/web-resources/package-lock.json", "utf8");
const hosts = new Set([...lock.matchAll(/"resolved":\s*"https?:\/\/([^/"]+)/g)].map((m) => m[1]));
const other = [...hosts].filter((h) => h !== "registry.npmjs.org");

console.log({ hosts: [...hosts] });
if (other.length > 0) {
  console.error(`package-lock.json resolves packages from ${other.join(", ")}. Run "npm install --package-lock-only --registry=https://registry.npmjs.org/" or replace the host with registry.npmjs.org.`);
  process.exit(1);
}
