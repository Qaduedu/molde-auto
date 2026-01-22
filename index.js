import readline from "readline";

import { emulators } from "./config/emulators.js";
import { sites } from "./config/sites.js";
import { SYSTEM } from "./config/system.js";

import { startEmulator } from "./services/emulator.service.js";
import { killEmulator } from "./services/emulatorCleanup.service.js";
import { runDeviceFlow } from "./services/deviceFlow.service.js";

import { delay } from "./utils/delay.js";
import { pause, resume, stop, isStopped, waitIfPaused } from "./utils/control.js";

import { hostConnectivityCheck, getHostPublicIp } from "./services/hostNet.service.js";
import { waitForBoot, waitForAdbPresence } from "./services/adbWait.service.js";

import { adb } from "./services/adb.service.js";

// ===== CONFIG DE PERFORMANCE/ROBUSTEZ =====
const CYCLES_PER_INSTANCE = 10;         // 10 ciclos por instância
const ADB_PRESENCE_TIMEOUT = 120000;    // 2 min (25s é curto demais em PC variado)
const START_STAGGER_MS = 30000;         // 30s entre boots (para 5 AVDs subir sem “sumir chamada”)
const RECYCLE_GAP_MS = 8000;            // pausa após reciclar
// =========================================

function setupKeyboardControls() {
  if (!process.stdin.isTTY) {
    console.log("⚠️  Teclas de controle indisponíveis (stdin não é TTY).");
    return;
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  console.log("🎛️  Controles: [p]=pausar  [r]=retomar  [q]=parar após o ciclo");
  process.stdin.on("keypress", (_, key) => {
    if (!key) return;
    if (key.name === "p") pause();
    if (key.name === "r") resume();
    if (key.name === "q") stop();
    if (key.ctrl && key.name === "c") stop();
  });
}

// ✅ Limpeza forte do Chrome (POR CICLO — como você pediu)
async function clearChromeForCycle(port) {
  console.log(`🧼 [${port}] Limpando Chrome (pm clear) para este ciclo...`);
  await adb(port, "shell am force-stop com.android.chrome").catch(() => {});
  await adb(port, "shell pm clear com.android.chrome").catch(() => {});
  await delay(800);
}

// ✅ Garantia de “device vivo” com recuperação
async function ensureDeviceReady(e, { forceRestart = false } = {}) {
  if (!forceRestart) {
    try {
      const state = await waitForAdbPresence(e.port, { timeoutMs: 6000 });
      if (state) return true;
    } catch {}
  }

  console.log(`🚑 [${e.port}] Recuperando emulador...`);
  try { await killEmulator(e.port); } catch {}
  await delay(1200);

  startEmulator(e);

  const state = await waitForAdbPresence(e.port, { timeoutMs: ADB_PRESENCE_TIMEOUT });
  console.log(`🧩 [${e.port}] apareceu no ADB (${state})`);

  await waitForBoot(e.port);
  return true;
}

async function runCycle(cycleNumber, instanceCycleNumber) {
  const activeEmulators = emulators.slice(0, SYSTEM.MAX_DEVICES);

  const isNewInstance = instanceCycleNumber === 1;
  const isRecycleCycle = instanceCycleNumber === CYCLES_PER_INSTANCE;

  console.log(`\n🌸 Ciclo ${cycleNumber} começando...`);
  console.log(`🧱 Instância: ciclo ${instanceCycleNumber}/${CYCLES_PER_INSTANCE}`);
  console.log(`🤖 Devices: ${activeEmulators.length} | 📋 Sites: ${sites.length}`);
  console.log("📌 Dica: pause com 'p', troque Wi-Fi/4G, retome com 'r'.");

  // 1) Preflight do host: internet + IP público
  if (SYSTEM.HOST_CONNECTIVITY_CHECK) {
    try {
      const ip = await hostConnectivityCheck();
      console.log(`✅ Host online. IP público atual: ${ip}`);
    } catch (e) {
      console.log(`❌ Host sem conectividade: ${e?.message || e}`);
      console.log("🛑 Vou encerrar este ciclo para você ajustar a rede e tentar novamente.");
      return;
    }
  } else if (SYSTEM.LOG_HOST_PUBLIC_IP) {
    const ip = await getHostPublicIp().catch(() => "desconhecido");
    console.log(`🌐 IP do host: ${ip}`);
  }

  const sitesList = [...sites];

  // 2) Subir emuladores apenas no começo da instância
  if (isNewInstance) {
    console.log("🚀 Subindo emuladores (headless) [nova instância]...");

    for (const e of activeEmulators) {
      await waitIfPaused();

      // ✅ garante porta/instância limpa antes de subir (evita “sobras” do ciclo anterior)
      try { await killEmulator(e.port); } catch {}
      await delay(1200);

      startEmulator(e);

      try {
        const state = await waitForAdbPresence(e.port, { timeoutMs: ADB_PRESENCE_TIMEOUT });
        console.log(`🧩 [${e.port}] apareceu no ADB (${state})`);
      } catch (err) {
        console.log(`💥 [${e.port}] não apareceu no ADB: ${err?.message || err}`);
        try { await killEmulator(e.port); } catch {}
        continue;
      }

      // ✅ escalonamento para evitar RAM/commit e ADB flapping
      await delay(START_STAGGER_MS);
    }
  } else {
    console.log("⚡ Reutilizando emuladores (sem reboot)...");
  }

  // 3) Boot / readiness
  console.log("⏳ Garantindo dispositivos prontos...");
  const bootHeartbeat = setInterval(() => console.log("🫧 Preparação ainda em andamento..."), 15000);

  const readyEmulators = [];
  await Promise.allSettled(
    activeEmulators.map(async (e) => {
      try {
        await waitIfPaused();

        if (isNewInstance) {
          await waitForBoot(e.port);
        } else {
          await ensureDeviceReady(e, { forceRestart: false });
        }

        readyEmulators.push(e);
      } catch (err) {
        console.log(`💥 [${e.port}] falhou ao preparar: ${err?.message || err}`);
        try { await killEmulator(e.port); } catch {}
      }
    })
  );

  clearInterval(bootHeartbeat);

  if (readyEmulators.length === 0) {
    console.log("⚠️ Nenhum device ficou pronto neste ciclo. Reiniciando no próximo...");
    return;
  }

  console.log(`✅ Devices prontos: ${readyEmulators.map(d => d.port).join(", ")}`);

  // 4) Limpar Chrome POR CICLO (como você pediu)
  console.log("🧼 Limpando Chrome (por ciclo)...");
  await Promise.allSettled(
    readyEmulators.map(e => clearChromeForCycle(e.port))
  );

  // 5) Rodar fluxo em paralelo (sem matar emulador a cada ciclo)
  await Promise.all(
    readyEmulators.map(async (e) => {
      console.log(`🧠 [${e.port}] Iniciando fluxo completo`);
      try {
        await runDeviceFlow(e.port, sitesList, { cycleNumber });
      } catch (err) {
        console.log(`💥 [${e.port}] Erro no fluxo:`, err?.message || err);
      } finally {
        console.log(`🧹 [${e.port}] Flow finalizado`);
        await delay(800);
      }
    })
  );

  // 6) Reciclar instância (matar emuladores) no final de 10 ciclos
  if (isRecycleCycle) {
    console.log(`♻️ Reciclando instância (fim do período ${CYCLES_PER_INSTANCE})...`);
    await Promise.allSettled(
      readyEmulators.map(async (e) => {
        try { await killEmulator(e.port); } catch {}
      })
    );
    await delay(RECYCLE_GAP_MS);
  }

  console.log("Ciclo finalizado.");
}

async function main() {
  console.log("🟢 Automação iniciada.");
  setupKeyboardControls();

  let cycle = 1;
  let instanceCycle = 1;

  while (!isStopped()) {
    await waitIfPaused();

    await runCycle(cycle, instanceCycle);

    cycle++;
    instanceCycle++;

    if (instanceCycle > CYCLES_PER_INSTANCE) {
      instanceCycle = 1; // nova instância
    }

    await delay(8000);
  }

  console.log("Encerrado com segurança.");
}

main().catch((e) => {
  console.log("💥 Erro fatal:", e?.message || e);
  process.exit(1);
});
