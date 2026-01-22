import { exec } from "child_process";
import { delay } from "../utils/delay.js";

function execp(cmd, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs, windowsHide: true }, (err, stdout) => {
      if (err) return reject(err);
      resolve(String(stdout ?? ""));
    });
  });
}

export async function waitForActivityService(port, { timeoutMs = 90000 } = {}) {
  const serial = `emulator-${port}`;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      // "service check activity" é um teste direto: ou o serviço existe, ou não.
      const out = await execp(`adb -s ${serial} shell service check activity`, 8000);
      // Em geral vem algo tipo: "Service activity: found"
      if (out.toLowerCase().includes("found")) return true;
    } catch {}

    await delay(1200);
  }

  return false;
}
