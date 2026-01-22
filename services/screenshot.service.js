import { spawn } from "child_process";
import fs from "fs";
import path from "path";

export async function takeScreenshot(port, outFile) {
  const serial = `emulator-${port}`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  return new Promise((resolve, reject) => {
    const adb = spawn("adb", ["-s", serial, "exec-out", "screencap", "-p"], {
      windowsHide: true
    });

    const out = fs.createWriteStream(outFile);
    let stderr = "";

    adb.stdout.pipe(out);
    adb.stderr.on("data", (d) => (stderr += d.toString()));

    adb.on("error", reject);

    adb.on("close", (code) => {
      out.close();
      if (code !== 0) {
        return reject(new Error(`screencap falhou (code=${code}): ${stderr}`));
      }
      try {
        const size = fs.statSync(outFile).size;
        resolve(size);
      } catch (e) {
        reject(e);
      }
    });
  });
}
