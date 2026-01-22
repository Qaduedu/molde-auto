import { exec } from "child_process";

export function adb(port, command, { timeoutMs = 25000 } = {}) {
  const serial = `emulator-${port}`;
  return new Promise((resolve, reject) => {
    exec(
      `adb -s ${serial} ${command}`,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve(String(stdout ?? "") + String(stderr ?? ""));
      }
    );
  });
}
