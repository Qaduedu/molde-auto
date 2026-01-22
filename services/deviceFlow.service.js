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
  await adb(
    port,
    "shell am start -n com.android.chrome/com.google.android.apps.chrome.Main"
  );
}

async function ensureChrome(port) {
  for (let i = 1; i <= 6; i++) {
    try {
      await openChromeMain(port);
      await delay(1500);
      return;
    } catch {
      console.log(`🧯 [${port}] Retry ${i}/6 abrindo Chrome...`);
      await delay(1500 * i);
    }
  }

  // fallback
  await adb(port, "shell monkey -p com.android.chrome 1").catch(() => {});
  await delay(1500);
}

async function mustBypassChromeFirstRun(port, reason) {
  const ok = await chromeFirstRunStrong(port).catch(() => false);
  if (!ok) {
    throw new Error(
      `Chrome preso no first-run (${reason}). Abortando device para evitar loop.`
    );
  }
}

// ✅ SUA FUNÇÃO (EXPORTADA) — pode deixar exatamente assim
export async function bypassChromeSyncScreen(port) {
  console.log(`🧩 [${port}] Tentando bypass da tela "Turn on sync?"...`);

  const tapSequences = [
    ["input tap 180 2080", "input tap 240 2080", "input tap 320 2080"],
    ["input tap 180 1980", "input tap 240 1980", "input tap 320 1980"],
    ["input tap 360 2080", "input tap 420 2080", "input tap 480 2080"],
  ];

  for (const seq of tapSequences) {
    for (const cmd of seq) {
      await adb(port, `shell ${cmd}`).catch(() => {});
      await delay(300);
    }
    await delay(400);
  }

  const keycodes = [66, 61, 22, 21, 66];

  for (const kc of keycodes) {
    await adb(port, `shell input keyevent ${kc}`).catch(() => {});
    await delay(250);
  }

  await adb(
    port,
    "shell am broadcast -a com.google.android.apps.chrome.ACTION_FIRST_RUN_COMPLETE"
  ).catch(() => {});

  await delay(600);
}

// ✅ IMPORTANTE: este é o export que seu index.js precisa
export async function runDeviceFlow(port, sitesList, { cycleNumber = 1 } = {}) {
  console.log(`📱 [${port}] Abrindo navegador`);


  // abre chrome e contorna first-run/anr via rotina forte
  await forceStopChrome(port);
  await ensureChrome(port);
  await mustBypassChromeFirstRun(port, "inicio");

  let idx = 0;
  const restartEveryN = Number(SYSTEM.RESTART_CHROME_EVERY_N_PAGES || 3);

  for (const raw of sitesList) {
    await waitIfPaused();

    const url = normalizeUrl(raw);
    if (!url) continue;

    idx++;
    const waitMs = idx === 1 ? SYSTEM.FIRST_PAGE_WAIT_MS : SYSTEM.PAGE_WAIT_MS;

    console.log(`🌍 [${port}] Visitando (${idx}/${sitesList.length}) ${url}`);

    // ✅ Reinicia Chrome a cada N páginas (ok)
    if (SYSTEM.RESTART_CHROME_BETWEEN_PAGES && restartEveryN > 0) {
      const shouldRestart = idx % restartEveryN === 0;
      if (shouldRestart) {
        await forceStopChrome(port);
        await ensureChrome(port);
        await mustBypassChromeFirstRun(port, `restart a cada ${restartEveryN} páginas`);
        await delay(600);
      }
    }

    // abre URL e espera
    await adb(port, `shell am start -a android.intent.action.VIEW -d "${url}"`).catch(() => {});
    await delay(waitMs);

    // ✅ ONLY FIRST SITE: turn on sync / onboarding
    if (idx === 1) {
      await chromeFirstRunStrong(port).catch(() => {});
      await delay(700);

      await bypassChromeSyncScreen(port).catch(() => {});
      await delay(400);

      // reabre a URL após contornar telas
      await adb(port, `shell am start -a android.intent.action.VIEW -d "${url}"`).catch(() => {});
      await delay(900);
    }

    await delay(SYSTEM.SCREENSHOT_SETTLE_MS);

    if (SYSTEM.TAKE_SCREENSHOT_EACH_PAGE) {
      try {
        const shot = await savePageScreenshot({
          port,
          url,
          cycleNumber,
          siteIndex: idx
        });
        console.log(`📸 [${port}] Print salvo: ${shot.file} (${Math.round(shot.size / 1024)} KB)`);
      } catch (e) {
        console.log(`⚠️ [${port}] Falha ao tirar print: ${e?.message || e}`);
      }
    }

    await delay(SYSTEM.BETWEEN_PAGES_MS);
  }


  console.log(`❌ [${port}] Fechando navegador`);
  await forceStopChrome(port);
}
