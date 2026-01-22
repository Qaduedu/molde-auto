import { exec } from "child_process";

function execp(cmd, { timeoutMs = 25000 } = {}) {
  return new Promise((resolve, reject) => {
    exec(
      cmd,
      { timeout: timeoutMs, windowsHide: true, maxBuffer: 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(err);
        resolve(String(stdout ?? "") + String(stderr ?? ""));
      }
    );
  });
}

export async function getHostPublicIp() {
  // tenta curl (Windows 10/11 geralmente tem)
  try {
    const out = await execp(`curl -s https://api.ipify.org`, { timeoutMs: 15000 });
    const ip = out.trim();
    if (ip) return ip;
  } catch {}

  // fallback PowerShell
  const ps = `powershell -NoProfile -Command "(Invoke-RestMethod -Uri 'https://api.ipify.org').ToString()"`;
  const out2 = await execp(ps, { timeoutMs: 20000 });
  return out2.trim();
}

export async function hostConnectivityCheck() {
  // Um check simples e confiável: bater no ipify
  const ip = await getHostPublicIp();
  if (!ip) throw new Error("Não consegui obter IP público do host (sem internet ou bloqueio).");
  return ip;
}
