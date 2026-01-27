import { spawn, spawnSync } from "child_process";

/**
 * Spawn ASSÍNCRONO sem abrir janela no Windows.
 * Retorna o ChildProcess.
 */
export function spawnHidden(cmd, args = [], opts = {}) {
  return spawn(cmd, args, {
    shell: false,
    windowsHide: true,
    ...opts,
  });
}

/**
 * Spawn SÍNCRONO sem abrir janela no Windows.
 */
export function spawnSyncHidden(cmd, args = [], opts = {}) {
  return spawnSync(cmd, args, {
    shell: false,
    windowsHide: true,
    ...opts,
  });
}

/**
 * Exec "tipo execFile", mas com Promise e sem abrir CMD.
 * Útil pra substituir exec/execSync do jeito certo.
 *
 * resolve: string stdout+stderr
 * reject: Error com stdout/stderr anexado
 */
export function execFilep(cmd, args = [], { timeoutMs = 25000, cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawnHidden(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"],
      cwd,
      env,
    });

    let out = "";
    let err = "";

    const timer = setTimeout(() => {
      try { child.kill("SIGKILL"); } catch {}
      reject(new Error(`Timeout executando ${cmd} ${args.join(" ")} (${timeoutMs}ms)`));
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));

    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const all = (out + err).trim();
      if (code === 0) return resolve(all);
      reject(new Error(all || `Processo falhou (code=${code})`));
    });
  });
}
