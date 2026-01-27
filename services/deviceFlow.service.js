import { adb } from "./adb.service.js";
import { delay } from "../utils/delay.js";
import { SYSTEM } from "../config/system.js";
import { waitIfPaused } from "../utils/control.js";
import { savePageScreenshot } from "./pageConfirm.service.js";
import { chromeFirstRunStrong } from "./uiGuard.service.js";

function normalizeUrl(url) {
  const u = String(url).trim();
  if (!u) return null;
  const fixed = u.replace(/^https?:\/\/https?:\/\//i, "https://");
  if (!/^https?:\/\//i.test(fixed)) return `https://${fixed}`;
  return fixed;
}

async function forceStopChrome(port) {
  await adb(port, "shell am force-stop com.android.chrome").catch(() => {});
}

async function openChromeMain(port) {
  await adb(port, "shell am start -n com.android.chrome/com.google.android.apps.chrome.Main");
}

async function ensureChrome(port) {
  for (let i = 1; i <= 4; i++) {
    try {
      await openChromeMain(port);
      await delay(700);
      return;
    } catch {
      await delay(700 * i);
    }
  }
  await adb(port, "shell monkey -p com.android.chrome 1").catch(() => {});
  await delay(700);
}

async function markerExists(port) {
  const out = await adb(port, "shell ls /data/local/tmp/chrome_first_run_done", { timeoutMs: 8000 }).catch(() => "");
  return String(out).includes("chrome_first_run_done");
}

async function setMarker(port) {
  // sem shell maluco: escreve via sh -c
  await adb(port, `shell sh -c "echo 1 > /data/local/tmp/chrome_first_run_done"`).catch(() => {});
}

// sua função existente (mantida e rápida)
export async function bypassChromeSyncScreen(port) {
  console.log(`🧩 [${port}] Turn on sync: bypass rápido...`);

  // TAB/ENTER costuma resolver mais rápido que tap infinito
  const keys = [61, 66, 61, 66]; // TAB, ENTER, TAB, ENTER
  for (const kc of keys) {
    await adb(port, `shell input keyevent ${kc}`).catch(() => {});
    await delay(180);
  }

  await adb(port, "shell am broadcast -a com.google.android.apps.chrome.ACTION_FIRST_RUN_COMPLETE").catch(() => {});
  await delay(350);
}

export async function runDeviceFlow(port, sitesList, { cycleNumber = 1, isNewInstance = false } = {}) {
  console.log(`📱 [${port}] Abrindo navegador`);

  // abre Chrome
  await forceStopChrome(port);
  await ensureChrome(port);

  // first-run curto
  const ok = await chromeFirstRunStrong(port, { attempts: 4 }).catch(() => false);
  if (!ok) throw new Error("Chrome preso no first-run.");

  let idx = 0;
  const restartEveryN = Number(SYSTEM.RESTART_CHROME_EVERY_N_PAGES || 3);

  for (const raw of sitesList) {
    await waitIfPaused();

    const url = normalizeUrl(raw);
    if (!url) continue;

    idx++;
    const waitMs = idx === 1 ? SYSTEM.FIRST_PAGE_WAIT_MS : SYSTEM.PAGE_WAIT_MS;

    console.log(`🌍 [${port}] Visitando (${idx}/${sitesList.length}) ${url}`);

    // restart eventual
    if (SYSTEM.RESTART_CHROME_BETWEEN_PAGES && restartEveryN > 0) {
      if (idx % restartEveryN === 0) {
        await forceStopChrome(port);
        await ensureChrome(port);

        const ok2 = await chromeFirstRunStrong(port, { attempts: 3 }).catch(() => false);
        if (!ok2) throw new Error("Chrome preso no first-run (restart).");

        await delay(250);
      }
    }

    // abre URL e espera
    await adb(port, `shell am start -a android.intent.action.VIEW -d "${url}"`).catch(() => {});
    await delay(waitMs);

    // ✅ Turn-on-sync só 1x por instância (no primeiro site)
    if (idx === 1 && isNewInstance) {
      const already = await markerExists(port).catch(() => false);
      if (!already) {
        await bypassChromeSyncScreen(port).catch(() => {});
        await setMarker(port).catch(() => {});

        // reabre a URL depois do onboarding
        await adb(port, `shell am start -a android.intent.action.VIEW -d "${url}"`).catch(() => {});
        await delay(500);
      }
    }

    await delay(SYSTEM.SCREENSHOT_SETTLE_MS);

    if (SYSTEM.TAKE_SCREENSHOT_EACH_PAGE) {
      try {
        const shot = await savePageScreenshot({ port, url, cycleNumber, siteIndex: idx });
        console.log(`📸 [${port}] Print: ${Math.round(shot.size / 1024)} KB`);
      } catch (e) {
        console.log(`⚠️ [${port}] Print falhou: ${e?.message || e}`);
      }
    }

    await delay(SYSTEM.BETWEEN_PAGES_MS);
  }

  console.log(`❌ [${port}] Fechando navegador`);
  await forceStopChrome(port);
}
