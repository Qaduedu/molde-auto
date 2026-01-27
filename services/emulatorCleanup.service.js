import { adbHost } from "./adb.service.js";
import { delay } from "../utils/delay.js";

async function sleep(ms) {
  return delay(ms);
}

export async function killEmulator(port) {
  const serial = `emulator-${port}`;

  try {
    await adbHost(["-s", serial, "emu", "kill"], { timeoutMs: 15000 });
  } catch {
    // já morreu, tudo certo
  }

  // espera sumir do adb devices
  for (let i = 0; i < 30; i++) {
    const out = await adbHost(["devices"], { timeoutMs: 15000 }).catch(() => "");
    if (!String(out).includes(serial)) return;
    await sleep(500);
  }
}
