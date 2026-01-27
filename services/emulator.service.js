import { spawn, spawnSync } from "child_process";
import path from "path";
import fs from "fs";
import { SYSTEM } from "../config/system.js";

function resolveSdk() {
  return (
    SYSTEM?.ANDROID_SDK_ROOT ||
    process.env.ANDROID_SDK_ROOT ||
    process.env.ANDROID_HOME ||
    (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk") : null)
  );
}

function getEmulatorExe() {
  const sdk = resolveSdk();
  if (!sdk) throw new Error("ANDROID_SDK_ROOT não definido.");
  const exe = path.join(sdk, "emulator", "emulator.exe");
  if (!fs.existsSync(exe)) throw new Error(`emulator.exe não encontrado: ${exe}`);
  return exe;
}

// ✅ sem execSync (sem shell)
let cachedAvds = null;
function listAvdsCached(emuExe) {
  if (cachedAvds) return cachedAvds;

  const r = spawnSync(emuExe, ["-list-avds"], {
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8"
  });

  const out = String(r.stdout || "") + String(r.stderr || "");
  cachedAvds = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return cachedAvds;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

export function startEmulator(e) {
  const EMU = getEmulatorExe();
  const avd = e?.avd;
  const port = e?.port;

  if (!avd) throw new Error("AVD não definido em config/emulators.js (use avd).");
  if (!port) throw new Error("Porta não definida em config/emulators.js (use port).");

  const avds = listAvdsCached(EMU);
  if (!avds.includes(avd)) {
    throw new Error(`AVD "${avd}" não existe neste PC. Disponíveis: ${avds.join(", ")}`);
  }

  const logDir = path.join(process.cwd(), "artifacts", "emulator-logs");
  ensureDir(logDir);
  const logFile = path.join(logDir, `emulator-${port}.log`);

  const args = [
  "-avd", avd,
  "-port", String(port),

  // 🔥 snapshot obrigatório
  "-snapshot", "default",
  "-no-snapshot-save",

  // headless real
  "-no-window",
  "-no-audio",
  "-no-boot-anim",

  // GPU estável
  "-gpu", "swiftshader_indirect",

  "-memory", String(SYSTEM.EMU_MEMORY_MB || 1024),
  "-cores", String(SYSTEM.EMU_CORES || 1),
];


  console.log(`🚀 [${port}] iniciando ${avd}`);
  console.log(`📝 [${port}] log: ${logFile}`);

  const outFd = fs.openSync(logFile, "a");

  const child = spawn(EMU, args, {
    windowsHide: true,
    shell: false,
    stdio: ["ignore", outFd, outFd],
    detached: true
  });

  child.on("error", (err) => {
    console.log(`💥 [${port}] spawn emulator falhou: ${err?.message || err}`);
  });

  child.unref();
}
