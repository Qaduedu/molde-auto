import fs from "fs";
import path from "path";
import { spawnHidden } from "../utils/winExec.js";

function resolveSdkRoot() {
  return (
    process.env.ANDROID_SDK_ROOT ||
    process.env.ANDROID_HOME ||
    (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null)
  );
}

function resolveAdbExe() {
  const sdk = resolveSdkRoot();
  if (sdk) {
    const p = path.join(sdk, "platform-tools", "adb.exe");
    if (fs.existsSync(p)) return p;
  }
  return "adb";
}

export const ADB_EXE = resolveAdbExe();

/**
 * Executa adb e retorna stdout+stderr como string.
 * NÃO abre CMD (spawn, shell:false, windowsHide:true).
 */
function runAdb(args, { timeoutMs = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnHidden(ADB_EXE, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });

    let out = "";
    let err = "";

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`Timeout adb ${args.join(" ")} (${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const all = (out + err).trim();
      if (code === 0) return resolve(all);
      reject(new Error(all || `adb falhou (code=${code})`));
    });
  });
}

/**
 * ADB no HOST (sem -s), ex:
 * await adbHost(["kill-server"])
 * await adbHost(["start-server"])
 */
export function adbHost(args, opts = {}) {
  return runAdb(args, opts);
}

/**
 * ADB em um device por PORTA:
 * await adb(5554, "shell getprop sys.boot_completed")
 */
export function adb(port, command, { timeoutMs = 25000 } = {}) {
  const serial = `emulator-${port}`;
  const parts = String(command).trim().split(/\s+/);

  return runAdb(["-s", serial, ...parts], { timeoutMs });
}

/**
 * Variante segura quando você já tem args separados (evita split):
 * await adbArgs(5554, ["shell","getprop","sys.boot_completed"])
 */
export function adbArgs(port, args, { timeoutMs = 25000 } = {}) {
  const serial = `emulator-${port}`;
  return runAdb(["-s", serial, ...args], { timeoutMs });
}
