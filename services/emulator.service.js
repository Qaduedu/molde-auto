import { spawn } from "child_process";

export function startEmulator({ name, port }) {
  console.log(`🚀 Iniciando emulador ${name} na porta ${port}`);

  return spawn(
    "emulator",
    [
      "-avd", name,
      "-port", port,
      "-no-window",
      "-no-audio",
      "-gpu", "off",
      "-no-snapshot-save"
    ],
    {
      stdio: "ignore",
      windowsHide: true
    }
  );
}
