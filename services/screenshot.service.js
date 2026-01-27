import { spawnHidden } from "../utils/winExec.js";
import fs from "fs";
import path from "path";
import { ADB_EXE } from "./adb.service.js";

export async function takeScreenshot(port, outFile) {
  const serial = `emulator-${port}`;
  fs.mkdirSync(path.dirname(outFile), { recursive: true });

  return new Promise((resolve, reject) => {
    const child = spawnHidden(ADB_EXE, ["-s", serial, "exec-out", "screencap", "-p"], {
      stdio: ["ignore", "pipe", "pipe"]
    });

    const out = fs.createWriteStream(outFile);
    let stderr = "";

    child.stdout.pipe(out);
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);

    child.on("close", (code) => {
      out.close();
      if (code !== 0) return reject(new Error(`screencap falhou (code=${code}): ${stderr}`));
      try {
        const size = fs.statSync(outFile).size;
        resolve(size);
      } catch (e) {
        reject(e);
      }
    });
  });
}
