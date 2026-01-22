import { exec } from "child_process";

function execp(cmd, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: timeoutMs, windowsHide: true }, (err, stdout, stderr) => {
      if (err) return reject(err);
      resolve(String(stdout ?? "") + String(stderr ?? ""));
    });
  });
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

export async function killEmulator(port) {
  const serial = `emulator-${port}`;

  try {
    await execp(`adb -s ${serial} emu kill`, { timeoutMs: 15000 });
  } catch {
    // se já morreu, tudo bem
  }

  // espera sumir do adb devices
  for (let i = 0; i < 20; i++) {
    const out = await execp(`adb devices`, { timeoutMs: 15000 }).catch(() => "");
    if (!out.includes(serial)) return;
    await sleep(500);
  }
}
