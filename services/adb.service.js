import { exec } from "child_process";
import path from "path";
import fs from "fs";

const ADB_EXE = (() => {
  const sdk =
    process.env.ANDROID_SDK_ROOT ||
    process.env.ANDROID_HOME ||
    (process.env.LOCALAPPDATA
      ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
      : null);

  if (sdk) {
    const p = path.join(sdk, "platform-tools", "adb.exe");
    if (fs.existsSync(p)) return `"${p}"`;
  }

  return "adb";
})();

function execp(cmd, { timeoutMs = 15000 } = {}) {
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(stderr || err);
        resolve(String(stdout ?? ""));
      }
    );
  });
}

/**
 * adb(port, "shell ...")
 */
export async function adb(port, command, opts = {}) {
  const serial = `emulator-${port}`;
  const cmd = `${ADB_EXE} -s ${serial} ${command}`;
  return execp(cmd, opts);
}
