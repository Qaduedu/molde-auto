import readline from "readline";

import { emulators } from "./config/emulators.js";
import { sites } from "./config/sites.js";
import { SYSTEM } from "./config/system.js";

import { startEmulator } from "./services/emulator.service.js";
import { killEmulator } from "./services/emulatorCleanup.service.js";
import { runDeviceFlow } from "./services/deviceFlow.service.js";

import { delay } from "./utils/delay.js";
import { pause, resume, stop, isStopped, waitIfPaused } from "./utils/control.js";

import { hostConnectivityCheck } from "./services/hostNet.service.js";
import { waitForBoot, waitForAdbPresence } from "./services/adbWait.service.js";
import { adb } from "./services/adb.service.js";

// ===== CONFIG (via ENV, com defaults iguais ao que você quer) =====
// quantos ciclos por “instância”
const CYCLES_PER_INSTANCE = Number(process.env.CYCLES_PER_INSTANCE || 100);

// tempo entre start de emuladores
const START_STAGGER_MS = Number(process.env.START_STAGGER_MS || 8000);

// pausa depois de reciclar (matar emuladores)
const RECYCLE_GAP_MS = Number(process.env.RECYCLE_GAP_MS || 6000);

// timeout pra ADB online
const ADB_TIMEOUT = Number(process.env.ADB_TIMEOUT || 180000);

// delay entre ciclos
const LOOP_DELAY_MS = Number(process.env.LOOP_DELAY_MS || 3000);
// ===============================================================

function setupKeyboardControls() {
  if (!process.stdin.isTTY) return;
  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);

  process.stdin.on("keypress", (_, key) => {
    if (!key) return;
    if (key.name === "p") pause();
    if (key.name === "r") resume();
    if (key.name === "q") stop();
    if (key.ctrl && key.name === "c") stop();
  });
}

// ✅ limpeza total: Chrome + “marcador” do turn-on-sync
async function heavyCleanForInstance(port) {
  console.log(`🧼 [${port}] LIMPEZA TOTAL (instância nova)`);
  await adb(port, "shell am force-stop com.android.chrome").catch(() => {});
  await adb(port, "shell pm clear com.android.chrome").catch(() => {});
  // remove marcador para forçar o bypass rodar de novo nessa instância
  await adb(port, "shell rm -f /data/local/tmp/chrome_first_run_done").catch(() => {});
  await delay(800);
}

async function runCycle(cycleNumber, instanceCycleNumber) {
  const active = emulators.slice(0, SYSTEM.MAX_DEVICES);
  const isNewInstance = instanceCycleNumber === 1;
  const isEndOfInstance = instanceCycleNumber === CYCLES_PER_INSTANCE;

  console.log(`\n🌸 Ciclo ${cycleNumber} começando...`);
  console.log(`🧱 Instância: ciclo ${instanceCycleNumber}/${CYCLES_PER_INSTANCE}`);
  console.log(`🤖 Devices: ${active.length} | 📋 Sites: ${sites.length}`);

  if (SYSTEM.HOST_CONNECTIVITY_CHECK) {
    try {
      const ip = await hostConnectivityCheck();
      console.log(`✅ Host online. IP público: ${ip}`);
    } catch (e) {
      console.log(`❌ Host sem conectividade: ${e?.message || e}`);
      return;
    }
  }

  // 1) Sobe emuladores só no começo da instância
  if (isNewInstance) {
    console.log("🚀 Subindo emuladores (instância nova)...");
    for (const e of active) {
      await waitIfPaused();
      startEmulator(e);
      await delay(START_STAGGER_MS);
    }
  } else {
    console.log("⚡ Reutilizando emuladores...");
  }

  // 2) ADB + boot
  console.log("⏳ Garantindo boot...");
  const ready = [];

  await Promise.allSettled(
    active.map(async (e) => {
      try {
        await waitIfPaused();
        await waitForAdbPresence(e.port, { timeoutMs: ADB_TIMEOUT, onlineOnly: true });
        await waitForBoot(e.port);
        ready.push(e);
      } catch (err) {
        console.log(`💥 [${e.port}] falhou no boot/adb: ${err?.message || err}`);
      }
    })
  );

  if (ready.length === 0) {
    console.log("⚠️ Nenhum device pronto. Encerrando ciclo.");
    return;
  }

  console.log(`✅ Devices prontos: ${ready.map((d) => d.port).join(", ")}`);

  // 3) LIMPEZA TOTAL somente no começo da instância (ciclo 1)
  if (isNewInstance) {
    await Promise.allSettled(ready.map((e) => heavyCleanForInstance(e.port)));
  }

  // 4) Flow (passa flag dizendo se é instância nova)
  await Promise.allSettled(
    ready.map(async (e) => {
      console.log(`🧠 [${e.port}] Iniciando fluxo`);
      try {
        await runDeviceFlow(e.port, sites, { cycleNumber, isNewInstance });
      } catch (err) {
        console.log(`💥 [${e.port}] Erro no fluxo: ${err?.message || err}`);
      } finally {
        console.log(`🧹 [${e.port}] Flow finalizado`);
      }
    })
  );

  // 5) RECICLA no final da instância
  if (isEndOfInstance) {
    console.log("♻️ Reciclando instância (fechando emuladores)...");
    await Promise.allSettled(ready.map((e) => killEmulator(e.port).catch(() => {})));
    await delay(RECYCLE_GAP_MS);
  }

  console.log("Ciclo finalizado.");
}

async function main() {
  setupKeyboardControls();

  let cycle = 1;
  let instanceCycle = 1;

  while (!isStopped()) {
    await waitIfPaused();

    await runCycle(cycle, instanceCycle);

    cycle++;
    instanceCycle++;

    if (instanceCycle > CYCLES_PER_INSTANCE) instanceCycle = 1;

    await delay(LOOP_DELAY_MS);
  }
}

main().catch((e) => {
  console.log("💥 Erro fatal:", e?.message || e);
  process.exit(1);
});
