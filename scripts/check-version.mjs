import { readFileSync } from "node:fs";

// Fails when the version in package.json, the solution and the changelog drift apart.
const pkg = JSON.parse(readFileSync("src/web-resources/package.json", "utf8")).version;
const solutionXml = readFileSync("src/solution/Other/Solution.xml", "utf8");
const solution = /<Version>([\d.]+)<\/Version>/.exec(solutionXml)?.[1];
const changelog = /^## \[(\d+\.\d+\.\d+)\]/m.exec(readFileSync("CHANGELOG.md", "utf8"))?.[1];

const three = (v) => (v ?? "").split(".").slice(0, 3).join(".");
const versions = { "package.json": pkg, "solution": three(solution), "changelog": changelog };
console.log(versions);

if (new Set(Object.values(versions)).size !== 1) {
  console.error("Version mismatch between package.json, the solution and the changelog.");
  process.exit(1);
}
