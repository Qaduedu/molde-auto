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

// ✅ IMPORTA adb “baixo nível” para poder limpar Chrome por instância
import { adb } from "./services/adb.service.js";

// ===== CONFIG DE PERFORMANCE/ROBUSTEZ =====
const CYCLES_PER_INSTANCE = 10;        // ✅ 10 ciclos por instância (como você pediu)
const ADB_PRESENCE_TIMEOUT = 25000;
const START_STAGGER_MS = 4000;         // evita pico de RAM/commit no Windows
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

// ✅ Limpeza “forte” do Chrome (1x por instância)
async function clearChromeForInstance(port) {
  const serial = `emulator-${port}`;
  console.log(`🧼 [${port}] Limpando Chrome (pm clear) para nova instância...`);
  await adb(port, "shell am force-stop com.android.chrome").catch(() => {});
  await adb(port, "shell pm clear com.android.chrome").catch(() => {});
  await delay(800);
}

// ✅ Garantia de “device vivo” com recuperação (sem quebrar o resto)
async function ensureDeviceReady(e, { forceRestart = false } = {}) {
  // Se não for forçar restart, tenta só checar presença
  if (!forceRestart) {
    try {
      const state = await waitForAdbPresence(e.port, { timeoutMs: 6000 });
      // Se apareceu no adb devices, ótimo; o boot “funcional” é garantido pelo waitForBoot se precisar.
      if (state) return true;
    } catch {}
  }

  // Start/restart do emulador
  console.log(`🚑 [${e.port}] Iniciando/recuperando emulador...`);
  startEmulator(e);

  // Espera aparecer no ADB
  const state = await waitForAdbPresence(e.port, { timeoutMs: ADB_PRESENCE_TIMEOUT });
  console.log(`🧩 [${e.port}] apareceu no ADB (${state})`);

  // Boot completo/funcional
  await waitForBoot(e.port);
  return true;
}

async function runCycle(cycleNumber, instanceCycleNumber) {
  const activeEmulators = emulators.slice(0, SYSTEM.MAX_DEVICES);

  const isNewInstance = instanceCycleNumber === 1;
  const isRecycleCycle = instanceCycleNumber === CYCLES_PER_INSTANCE;

  console.log(`\n🌸 Ciclo ${cycleNumber} começando...`);
  console.log(`🧱 Instância: ciclo ${instanceCycleNumber}/${CYCLES_PER_INSTANCE} (reuse emulador)`);
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
    console.log(`IP do host: ${ip}`);
  }

  const sitesList = [...sites];

  // 2) Subir emuladores apenas no começo da instância (cascata rápida)
  if (isNewInstance) {
    console.log("🚀 Subindo emuladores (headless) [nova instância]...");
    for (const e of activeEmulators) {
      await waitIfPaused();

      startEmulator(e);

      try {
        const state = await waitForAdbPresence(e.port, { timeoutMs: ADB_PRESENCE_TIMEOUT });
        console.log(`🧩 [${e.port}] apareceu no ADB (${state})`);
      } catch (err) {
        console.log(`💥 [${e.port}] não apareceu no ADB a tempo: ${err?.message || err}`);
        try { await killEmulator(e.port); } catch {}
        continue;
      }

      await delay(START_STAGGER_MS);
    }
  } else {
    console.log("⚡ Reutilizando emuladores (sem reboot)...");
  }

  // 3) Boot (só quando necessário)
  //    - Em nova instância: garante boot de todos
  //    - Em ciclos seguintes: só recupera quem caiu
  console.log("⏳ Garantindo dispositivos prontos...");
  const bootHeartbeat = setInterval(() => console.log("🫧 Preparação ainda em andamento..."), 15000);

  const readyEmulators = [];

  await Promise.allSettled(
    activeEmulators.map(async (e) => {
      try {
        await waitIfPaused();

        if (isNewInstance) {
          // Boot completo para todos no começo da instância
          await waitForBoot(e.port);
        } else {
          // Ciclos seguintes: só recupera se sumiu/offline
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

  // 4) Limpar Chrome apenas 1x por instância (antes do flow)
  if (isNewInstance) {
    console.log("🧼 Limpando Chrome (1x por instância)...");
    // Faz em paralelo para não atrasar
    await Promise.allSettled(
      readyEmulators.map(e => clearChromeForInstance(e.port))
    );
  }

  // 5) Rodar fluxo em paralelo (sem matar emulador aqui)
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
        // ⚠️ NÃO matamos o emulador a cada ciclo (ganho de velocidade)
      }
    })
  );

  // 6) Reciclar instância (matar emuladores) apenas no final do período
  if (isRecycleCycle) {
    console.log(`♻️ Reciclando instância (fim do período ${CYCLES_PER_INSTANCE})...`);
    await Promise.allSettled(
      readyEmulators.map(async (e) => {
        try {
          await killEmulator(e.port);
        } catch {}
      })
    );
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
