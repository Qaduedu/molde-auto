import { adb } from "./adb.service.js";
import { delay } from "../utils/delay.js";

export async function bypassChromeSyncScreen(port) {
  await adb(port, "shell input keyevent 61").catch(() => {});
  await adb(port, "shell input keyevent 66").catch(() => {});
  await delay(300);

  await adb(port, "shell input keyevent 61").catch(() => {});
  await adb(port, "shell input keyevent 66").catch(() => {});
  await delay(300);

  await adb(
    port,
    "shell sh -c 'echo 1 > /data/local/tmp/chrome_first_run_done'"
  ).catch(() => {});
}
