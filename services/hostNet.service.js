export async function getHostPublicIp() {
  // Node 18+ tem fetch global
  const r = await fetch("https://api.ipify.org", { cache: "no-store" });
  const t = (await r.text()).trim();
  if (!t) throw new Error("IP vazio do ipify");
  return t;
}

export async function hostConnectivityCheck() {
  const ip = await getHostPublicIp();
  if (!ip) throw new Error("Não consegui obter IP público do host.");
  return ip;
}
