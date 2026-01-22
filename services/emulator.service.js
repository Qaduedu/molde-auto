import { spawn, execSync } from "child_process";
import path from "path";
import fs from "fs";
import { SYSTEM } from "../config/system.js";

function resolveSdk() {
  return (
    SYSTEM?.ANDROID_SDK_ROOT ||
    process.env.ANDROID_SDK_ROOT ||
    process.env.ANDROID_HOME ||
    (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null)
  );
}

function getEmulatorExe() {
  const sdk = resolveSdk();
  if (!sdk) throw new Error("ANDROID_SDK_ROOT não definido.");
  const exe = path.join(sdk, "emulator", "emulator.exe");
  if (!fs.existsSync(exe)) throw new Error(`emulator.exe não encontrado: ${exe}`);
  return exe;
}

// ✅ cache para não chamar -list-avds toda hora
let cachedAvds = null;
function listAvdsCached(emuExe) {
  if (cachedAvds) return cachedAvds;
  const out = execSync(`"${emuExe}" -list-avds`, { windowsHide: true }).toString();
  cachedAvds = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  return cachedAvds;
}

export function startEmulator(e) {
  const EMU = getEmulatorExe();
  const avd = e?.avd;
  const port = e?.port;

  if (!avd) throw new Error("AVD não definido em config/emulators.js (use avd).");
  if (!port) throw new Error("Porta não definida em config/emulators.js (use port).");

  // ✅ Falha cedo se o AVD não existir
  const avds = listAvdsCached(EMU);
  if (!avds.includes(avd)) {
    throw new Error(`AVD "${avd}" não existe neste PC. Disponíveis: ${avds.join(", ")}`);
  }

  const args = [
    "-avd", avd,
    "-port", String(port),
    "-no-window",
    "-no-audio",
    "-no-boot-anim",
    "-gpu", "off",
    "-no-snapshot-save",
    "-no-snapshot-load"
  ];

  const debug = process.env.DEBUG_EMULATOR === "1";

  // ✅ log por porta
  const logDir = path.join(process.cwd(), "artifacts", "emulator-logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logFile = path.join(logDir, `emulator-${port}.log`);

  // ✅ log limpo no terminal (sem spam)
  console.log(`🚀 [${port}] start ${avd}${debug ? " (DEBUG)" : ""}`);

  if (debug) {
    // debug: mostra tudo no console
    const child = spawn(EMU, args, { stdio: "inherit", windowsHide: false });
    child.on("exit", (code) => console.log(`🛑 [${port}] emulator exit code=${code}`));
    child.on("error", (err) => console.log(`💥 [${port}] spawn error: ${err?.message || err}`));
    return;
  }

  // normal: manda stdout/stderr pro arquivo e mantém terminal limpo
  const outFd = fs.openSync(logFile, "a");

  const child = spawn(EMU, args, {
    windowsHide: true,
    stdio: ["ignore", outFd, outFd]
    // ✅ sem detached (reduz chance de abrir janela/cmd em alguns Windows)
  });

  child.on("error", (err) => {
    console.log(`💥 [${port}] spawn falhou: ${err?.message || err}`);
    try { fs.closeSync(outFd); } catch {}
  });

  child.on("exit", (code) => {
    // não é "erro" necessariamente, mas ajuda a diagnosticar
    if (code !== 0) {
      console.log(`⚠️ [${port}] emulador encerrou (code=${code}). Veja: ${logFile}`);
    }
    try { fs.closeSync(outFd); } catch {}
  });
}
