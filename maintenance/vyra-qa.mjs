import fs from "node:fs";

function fail(message) {
  console.error("VYRA QA:", message);
  process.exitCode = 1;
}

const app = fs.readFileSync("app.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");
const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));

try {
  new Function(app);
  console.log("✓ app.js syntax");
} catch (error) {
  fail("app.js syntax error: " + error.message);
}

const badEscapes = (app.match(/\\n/g) || []).length;
if (badEscapes) fail("app.js contains " + badEscapes + " literal \\n escape(s)");
else console.log("✓ no stray literal \\n tokens");

for (const file of ["style.css", "app.js", "manifest.json", "icon.svg", "sw.js"]) {
  if (!fs.existsSync(file)) fail("missing required file: " + file);
  else console.log("✓ " + file);
}

for (const ref of index.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const value = ref[1].split("?")[0];
  if (value.startsWith("./") && !value.startsWith("./http") && !fs.existsSync(value.slice(2))) {
    fail("index references missing local file: " + value);
  }
}

if (manifest.start_url !== "./") fail("manifest start_url should stay ./");
if (!Array.isArray(manifest.icons) || !manifest.icons.length) fail("manifest icons are missing");

console.log(process.exitCode ? "VYRA QA FAILED" : "VYRA QA PASSED");
