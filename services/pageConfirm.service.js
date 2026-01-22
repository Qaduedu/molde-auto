import path from "path";
import { takeScreenshot } from "./screenshot.service.js";

function safeName(s) {
  return String(s)
    .replace(/https?:\/\//gi, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .slice(0, 90);
}

export async function savePageScreenshot({ port, url, cycleNumber, siteIndex }) {
  const file = path.join(
    process.cwd(),
    "artifacts",
    "screens",
    `cycle_${cycleNumber}`,
    `dev_${port}`,
    `${String(siteIndex).padStart(3, "0")}_${safeName(url)}.png`
  );

  const size = await takeScreenshot(port, file);
  return { file, size };
}
