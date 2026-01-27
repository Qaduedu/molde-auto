import { adb } from "./adb.service.js";
import { delay } from "../utils/delay.js";

let sizeCache = new Map(); // port -> {w,h,ts}

async function uiDumpXml(port) {
  // dump é caro, então só usa quando necessário
  await adb(port, "shell uiautomator dump /sdcard/uidump.xml", { timeoutMs: 18000 }).catch(() => {});
  const xml = await adb(port, "shell cat /sdcard/uidump.xml", { timeoutMs: 18000 }).catch(() => "");
  return String(xml || "");
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function findButtonCenter(xml, label) {
  const lab = escapeRegExp(label);
  const re = new RegExp(
    `(?:text|content-desc)="${lab}"[\\s\\S]*?bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`,
    "i"
  );
  const m = xml.match(re);
  if (!m) return null;
  const x1 = Number(m[1]), y1 = Number(m[2]), x2 = Number(m[3]), y2 = Number(m[4]);
  return { x: Math.floor((x1 + x2) / 2), y: Math.floor((y1 + y2) / 2) };
}

async function tapByTextOnce(port, labels) {
  const xml = await uiDumpXml(port);
  for (const label of labels) {
    const p = findButtonCenter(xml, label);
    if (p) {
      await adb(port, `shell input tap ${p.x} ${p.y}`).catch(() => {});
      return true;
    }
  }
  return false;
}

async function getScreenSize(port) {
  const cached = sizeCache.get(port);
  if (cached && Date.now() - cached.ts < 120000) return cached; // 2 min cache

  const out = await adb(port, "shell wm size", { timeoutMs: 12000 }).catch(() => "");
  const m = String(out).match(/(\d+)\s*x\s*(\d+)/i);
  const res = m ? { w: Number(m[1]), h: Number(m[2]), ts: Date.now() } : { w: 1080, h: 1920, ts: Date.now() };
  sizeCache.set(port, res);
  return res;
}

async function tapPct(port, xpct, ypct) {
  const { w, h } = await getScreenSize(port);
  const x = Math.floor(w * xpct);
  const y = Math.floor(h * ypct);
  await adb(port, `shell input tap ${x} ${y}`).catch(() => {});
}

async function swipeUpSmall(port) {
  const { w, h } = await getScreenSize(port);
  const x = Math.floor(w * 0.5);
  const y1 = Math.floor(h * 0.80);
  const y2 = Math.floor(h * 0.55);
  await adb(port, `shell input swipe ${x} ${y1} ${x} ${y2} 180`).catch(() => {});
}

async function hasAnyText(port, needles) {
  // aqui: 1 dump só (sem delay extra)
  const xml = await uiDumpXml(port);
  const low = xml.toLowerCase();
  return needles.some(n => low.includes(n.toLowerCase()));
}

export async function closeAnrIfPresent(port) {
  // ANR atrasa tudo; tenta rápido e segue
  const anr = await hasAnyText(port, [
    "isn't responding",
    "is not responding",
    "not responding",
    "não está respondendo"
  ]).catch(() => false);

  if (!anr) return false;

  console.log(`🛡️ [${port}] ANR detectado. Fechando...`);

  // tenta botão por texto (1 dump)
  const clicked = await tapByTextOnce(port, ["Close app", "Fechar app", "OK", "Fechar"]).catch(() => false);
  if (!clicked) {
    await adb(port, "shell input keyevent 19").catch(() => {});
    await delay(120);
    await adb(port, "shell input keyevent 66").catch(() => {});
  }
  await delay(350);
  return true;
}

async function isChromeFirstRunFast(port) {
  // primeiro tenta detectar via dump (é o mais confiável),
  // mas sem rodar 1000x: 1 vez por tentativa do loop principal
  return await hasAnyText(port, [
    "Welcome to Chrome",
    "Bem-vindo ao Chrome",
    "Accept & continue",
    "Aceitar e continuar",
    "Turn on sync",
    "Ativar sincronização",
    "Use Chrome",
    "Fazer login"
  ]).catch(() => false);
}

/**
 * ✅ Versão rápida:
 * - tenta taps por posição (quase sempre resolve)
 * - se persistir, 1 dump e tenta por texto
 * - poucas tentativas + delays curtos
 */
export async function chromeFirstRunStrong(port, { attempts = 4 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    await closeAnrIfPresent(port).catch(() => {});

    const on = await isChromeFirstRunFast(port);
    if (!on) return true;

    console.log(`🧩 [${port}] First-run detectado. Contornando... (${i}/${attempts})`);

    // 1) Caminho rápido (posição)
    // botão principal geralmente embaixo (aceitar/continuar)
    await tapPct(port, 0.50, 0.92);
    await delay(350);

    // “não / pular / sem conta” geralmente embaixo esquerda
    await tapPct(port, 0.20, 0.92);
    await delay(300);

    // 2) Se ainda preso, tenta scroll pequeno
    await swipeUpSmall(port);
    await delay(250);

    // 3) Se ainda preso, 1 tentativa por texto (mais caro)
    const still = await isChromeFirstRunFast(port);
    if (still) {
      await tapByTextOnce(port, ["Accept & continue", "Aceitar e continuar"]).catch(() => false);
      await delay(350);

      await tapByTextOnce(port, [
        "No thanks",
        "Not now",
        "Skip",
        "Não, obrigado",
        "Agora não",
        "Pular",
        "Continuar sem conta"
      ]).catch(() => false);
      await delay(300);
    }

    await delay(250);
  }

  return false;
}
