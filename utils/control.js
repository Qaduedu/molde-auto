let paused = false;
let stopped = false;

export function isPaused() {
  return paused;
}

export function isStopped() {
  return stopped;
}

export function pause() {
  paused = true;
  console.log("⏸️  PAUSADO");
}

export function resume() {
  paused = false;
  console.log("▶️  RETOMADO");
}

export function stop() {
  stopped = true;
  console.log("🛑 ENCERRANDO APÓS CICLO ATUAL");
}

export async function waitIfPaused() {
  while (paused) {
    await new Promise(r => setTimeout(r, 500));
  }
}
