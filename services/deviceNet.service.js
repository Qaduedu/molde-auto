import { adb } from "./adb.service.js";

/**
 * Check ULTRA simples e rápido:
 * - confia no Android (se tem rota default, seguimos)
 * - não faz ping
 * - não faz retry
 * - não reseta Wi-Fi
 */
export async function quickInternetCheck(port, { timeoutMs = 8000 } = {}) {
  try {
    const route = await adb(port, "shell ip route", { timeoutMs });
    return String(route).includes("default via");
  } catch {
    return false;
  }
}
