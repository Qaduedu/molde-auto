import { adb } from "./adb.service.js";
import { delay } from "../utils/delay.js";

export async function waitForActivityService(port, { timeoutMs = 90000 } = {}) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      const out = await adb(port, "shell service check activity", { timeoutMs: 8000 });
      if (String(out).toLowerCase().includes("found")) return true;
    } catch {}
    await delay(1200);
  }

  return false;
}
