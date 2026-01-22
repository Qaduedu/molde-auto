import { exec } from "child_process";

function execp(cmd, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout) => (err ? reject(err) : resolve(String(stdout ?? "")))
    );
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
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
    .map(l => l.trim())
    .filter(l => l && !l.startsWith("List of devices"))
    .map(l => {
      const [serial, state] = l.split(/\s+/);
      return { serial, state };
    });
}

// ✅ EXPORT 1: presença no ADB (para cascata rápida)
export async function waitForAdbPresence(port, { timeoutMs = 25000 } = {}) {
  const serial = `emulator-${port}`;

  console.log(`🔎 [${port}] esperando presença no ADB (adb devices)...`);
  await waitUntil(
    async () => {
      const out = await execp("adb devices", { timeoutMs: 8000 });
      const devices = parseAdbDevices(out);
      return devices.some(d => d.serial === serial);
    },
    { label: `[${port}] aparecer em adb devices`, timeoutMs }
  );

  const out = await execp("adb devices", { timeoutMs: 8000 }).catch(() => "");
  const hit = parseAdbDevices(out).find(d => d.serial === serial);
  const state = hit?.state || "unknown";

  console.log(`🧩 [${port}] presente no ADB (${state})`);
  return state;
}

async function disableSystemAnimations(serial) {
  console.log(`⚙️ [${serial}] desativando animações do sistema...`);
  await execp(`adb -s ${serial} shell settings put global window_animation_scale 0`).catch(()=>{});
  await execp(`adb -s ${serial} shell settings put global transition_animation_scale 0`).catch(()=>{});
  await execp(`adb -s ${serial} shell settings put global animator_duration_scale 0`).catch(()=>{});
  await sleep(500);
}

async function activityServiceReady(serial) {
  try {
    const out = await execp(`adb -s ${serial} shell cmd activity get-config`, { timeoutMs: 12000 });
    const s = String(out || "").trim();
    return s && !s.includes("Can't find service: activity");
  } catch {
    return false;
  }
}

// ✅ EXPORT 2: boot completo/funcional (o index.js importa isso)
export async function waitForBoot(port) {
  const serial = `emulator-${port}`;

  // presença rápida no ADB (ajuda o cascata)
  try { await waitForAdbPresence(port, { timeoutMs: 25000 }); } catch {}

  console.log(`🔎 [${port}] esperando ADB (wait-for-device)...`);
  await execp(`adb -s ${serial} wait-for-device`, { timeoutMs: 60000 });

  console.log(`🔎 [${port}] esperando sys.boot_completed (com fallback activity)...`);
  await waitUntil(
    async () => {
      const v = (await execp(`adb -s ${serial} shell getprop sys.boot_completed`, { timeoutMs: 12000 })).trim();
      if (v === "1") return true;
      return await activityServiceReady(serial);
    },
    {
      label: `[${port}] boot ok (boot_completed=1 ou activity pronta)`,
      timeoutMs: 150000,
      onTick: async (elapsed) => {
        const v = await execp(`adb -s ${serial} shell getprop sys.boot_completed`, { timeoutMs: 12000 }).catch(() => "");
        const act = await activityServiceReady(serial).catch(() => false);
        console.log(`⏳ [${port}] boot_completed="${String(v).trim()}" activity=${act ? "ok" : "no"} (${Math.round(elapsed/1000)}s)`);
      }
    }
  );

  console.log(`🔎 [${port}] aguardando bootanim (opcional)...`);
  try {
    await waitUntil(
      async () => {
        const v = (await execp(`adb -s ${serial} shell getprop init.svc.bootanim`, { timeoutMs: 12000 })).trim();
        return v === "stopped";
      },
      { label: `[${port}] bootanim=stopped`, timeoutMs: 45000 }
    );
  } catch {
    console.log(`⚠️ [${port}] bootanim não confirmou stopped, seguindo...`);
  }

  console.log(`🔎 [${port}] validando framework (pm path android)...`);
  await waitUntil(
    async () => {
      const out = await execp(`adb -s ${serial} shell pm path android`, { timeoutMs: 15000 });
      return out.trim().startsWith("package:");
    },
    { label: `[${port}] pm path android`, timeoutMs: 90000 }
  );

  await disableSystemAnimations(serial);
  await sleep(800);

  console.log(`✅ [${port}] boot funcional confirmado e sistema estabilizado`);
}
