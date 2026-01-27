import { spawn } from "child_process";
import path from "path";
import fs from "fs";

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
  return "adb"; // fallback (ideal é achar o sdk)
}

const ADB_EXE = resolveAdbExe();

function runAdb(args, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(ADB_EXE, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let out = "";
    let err = "";

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`Timeout rodando adb ${args.join(" ")} (${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve((out + err).trim());
      reject(new Error(`adb falhou (code=${code}): ${(out + err).trim()}`));
    });
  });
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitUntil(fn, {
  timeoutMs = 120000,
  intervalMs = 1200,
  label = "condição",
  onTick = null
} = {}) {
  const start = Date.now();
  let ticks = 0;

  while (true) {
    ticks++;
    try {
      const ok = await fn();
      if (ok) return true;
    } catch {}

    const elapsed = Date.now() - start;
    if (onTick && ticks % 5 === 0) {
      try { await onTick(elapsed); } catch {}
    }

    if (elapsed > timeoutMs) {
      throw new Error(`Timeout aguardando ${label} (${timeoutMs}ms)`);
    }

    await sleep(intervalMs);
  }
}

function parseAdbDevices(text) {
  return String(text)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("List of devices"))
    .map((l) => {
      const [serial, state] = l.split(/\s+/);
      return { serial, state };
    });
}

// onlineOnly=true exige state=device
export async function waitForAdbPresence(
  port,
  { timeoutMs = 60000, onlineOnly = false } = {}
) {
  const serial = `emulator-${port}`;
  console.log(`🔎 [${port}] esperando aparecer no ADB (adb devices)...`);

  await waitUntil(
    async () => {
      const out = await runAdb(["devices"], { timeoutMs: 8000 });
      const devices = parseAdbDevices(out);
      const hit = devices.find((d) => d.serial === serial);
      if (!hit) return false;
      if (!onlineOnly) return true;
      return hit.state === "device";
    },
    {
      label: onlineOnly
        ? `[${port}] ficar ONLINE (state=device)`
        : `[${port}] aparecer em adb devices`,
      timeoutMs,
      onTick: async (elapsed) => {
        const out = await runAdb(["devices"], { timeoutMs: 8000 }).catch(() => "");
        const hit = parseAdbDevices(out).find((d) => d.serial === serial);
        const state = hit?.state || "absent";
        console.log(`⏳ [${port}] state=${state} (${Math.round(elapsed / 1000)}s)`);
      }
    }
  );

  const out = await runAdb(["devices"], { timeoutMs: 8000 }).catch(() => "");
  const hit = parseAdbDevices(out).find((d) => d.serial === serial);
  const state = hit?.state || "unknown";

  console.log(`🧩 [${port}] presente no ADB (${state})`);
  return state;
}

async function disableSystemAnimations(serial) {
  console.log(`⚙️ [${serial}] desativando animações do sistema...`);
  await runAdb(["-s", serial, "shell", "settings", "put", "global", "window_animation_scale", "0"], { timeoutMs: 15000 }).catch(()=>{});
  await runAdb(["-s", serial, "shell", "settings", "put", "global", "transition_animation_scale", "0"], { timeoutMs: 15000 }).catch(()=>{});
  await runAdb(["-s", serial, "shell", "settings", "put", "global", "animator_duration_scale", "0"], { timeoutMs: 15000 }).catch(()=>{});
  await sleep(500);
}

async function activityServiceReady(serial) {
  try {
    const out = await runAdb(["-s", serial, "shell", "cmd", "activity", "get-config"], { timeoutMs: 12000 });
    const s = String(out || "").trim();
    return s && !s.includes("Can't find service: activity");
  } catch {
    return false;
  }
}

export async function waitForBoot(port) {
  const serial = `emulator-${port}`;

  // garante ONLINE (state=device)
  await waitForAdbPresence(port, { timeoutMs: 180000, onlineOnly: true });

  console.log(`🔎 [${port}] esperando sys.boot_completed (com fallback activity)...`);
  await waitUntil(
    async () => {
      const v = (await runAdb(["-s", serial, "shell", "getprop", "sys.boot_completed"], { timeoutMs: 12000 })).trim();
      if (v === "1") return true;
      return await activityServiceReady(serial);
    },
    {
      label: `[${port}] boot ok (boot_completed=1 ou activity pronta)`,
      timeoutMs: 240000,
      onTick: async (elapsed) => {
        const v = await runAdb(["-s", serial, "shell", "getprop", "sys.boot_completed"], { timeoutMs: 12000 }).catch(() => "");
        const act = await activityServiceReady(serial).catch(() => false);
        console.log(`⏳ [${port}] boot_completed="${String(v).trim()}" activity=${act ? "ok" : "no"} (${Math.round(elapsed/1000)}s)`);
      }
    }
  );

  await disableSystemAnimations(serial);
  await sleep(800);

  console.log(`✅ [${port}] boot funcional confirmado e sistema estabilizado`);
}
