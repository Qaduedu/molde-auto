import fs from "fs";
import path from "path";

export function loadLocalEnv() {
  const p = path.resolve("config", "local.env");
  if (!fs.existsSync(p)) return;

  const text = fs.readFileSync(p, "utf-8");
  for (const line of text.split(/\r?\n/)) {
    const l = line.trim();
    if (!l || l.startsWith("#")) continue;
    const idx = l.indexOf("=");
    if (idx === -1) continue;

    const key = l.slice(0, idx).trim();
    const val = l.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}
