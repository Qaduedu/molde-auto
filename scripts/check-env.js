import fs from "fs";
import path from "path";
import { loadLocalEnv } from "../utils/loadLocalEnv.js";

loadLocalEnv();

const sdk = process.env.ANDROID_SDK_ROOT;
if (!sdk) {
  console.log("❌ ANDROID_SDK_ROOT não definido. Copie config/local.env.example -> config/local.env e edite.");
  process.exit(1);
}

const adb = path.join(sdk, "platform-tools", "adb.exe");
const emulator = path.join(sdk, "emulator", "emulator.exe");

if (!fs.existsSync(adb)) {
  console.log("❌ adb.exe não encontrado:", adb);
  process.exit(1);
}
if (!fs.existsSync(emulator)) {
  console.log("❌ emulator.exe não encontrado:", emulator);
  process.exit(1);
}

console.log("✅ ANDROID_SDK_ROOT:", sdk);
console.log("✅ adb.exe:", adb);
console.log("✅ emulator.exe:", emulator);

console.log("✅ Ambiente OK");
