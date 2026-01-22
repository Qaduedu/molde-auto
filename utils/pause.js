let paused = false;

export function pause() {
  paused = true;
}

export function resume() {
  paused = false;
}

export async function waitIfPaused() {
  while (paused) {
    await new Promise(r => setTimeout(r, 1000));
  }
}
