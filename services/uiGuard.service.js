import { adb } from "./adb.service.js";
import { delay } from "../utils/delay.js";

async function uiDumpXml(port) {
  await delay(250);
  await adb(port, "shell uiautomator dump /sdcard/uidump.xml", { timeoutMs: 25000 }).catch(() => {});
  const xml = await adb(port, "shell cat /sdcard/uidump.xml", { timeoutMs: 25000 }).catch(() => "");
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

async function tapText(port, labels) {
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

async function hasAnyText(port, needles) {
  const xml = await uiDumpXml(port);
  const low = xml.toLowerCase();
  return needles.some(n => low.includes(n.toLowerCase()));
}

async function getScreenSize(port) {
  const out = await adb(port, "shell wm size", { timeoutMs: 15000 }).catch(() => "");
  // ex: "Physical size: 1080x1920"
  const m = String(out).match(/(\d+)\s*x\s*(\d+)/i);
  if (!m) return { w: 1080, h: 1920 };
  return { w: Number(m[1]), h: Number(m[2]) };
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
  const y1 = Math.floor(h * 0.78);
  const y2 = Math.floor(h * 0.55);
  await adb(port, `shell input swipe ${x} ${y1} ${x} ${y2} 250`).catch(() => {});
}

export async function closeAnrIfPresent(port) {
  const anr = await hasAnyText(port, [
    "isn't responding",
    "is not responding",
    "not responding",
    "não está respondendo"
  ]).catch(() => false);

  if (!anr) return false;

  console.log(`🛡️ [${port}] ANR detectado. Tentando fechar...`);

  // tenta botão por texto
  const clicked = await tapText(port, ["Close app", "Fechar app", "OK", "Fechar"]).catch(() => false);
  if (!clicked) {
    // fallback teclado
    await adb(port, "shell input keyevent 19").catch(() => {});
    await delay(150);
    await adb(port, "shell input keyevent 66").catch(() => {});
  }
  await delay(900);
  return true;
}

async function isChromeFirstRun(port) {
  return await hasAnyText(port, [
    "Welcome to Chrome",
    "Bem-vindo ao Chrome",
    "Accept & continue",
    "Aceitar e continuar"
  ]).catch(() => false);
}

async function tryByTextFirstRun(port) {
  // 1) Accept
  await tapText(port, ["Accept & continue", "Aceitar e continuar"]).catch(() => false);
  await delay(1100);

  // 2) Skip sync
  await tapText(port, [
    "No thanks",
    "Not now",
    "Skip",
    "Não, obrigado",
    "Agora não",
    "Pular",
    "Continuar sem conta"
  ]).catch(() => false);
  await delay(900);
}

async function tryByPositionFirstRun(port) {
  // fallback robusto por proporção de tela (sem coordenada fixa)
  // botão principal costuma ficar no rodapé (centro)
  await tapPct(port, 0.50, 0.92);
  await delay(1100);

  // “não / pular” costuma ficar no rodapé esquerdo
  await tapPct(port, 0.20, 0.92);
  await delay(900);
}

export async function chromeFirstRunStrong(port, { attempts = 10 } = {}) {
  for (let i = 1; i <= attempts; i++) {
    await closeAnrIfPresent(port).catch(() => {});

    const onFirstRun = await isChromeFirstRun(port);
    if (!onFirstRun) return true;

    console.log(`🧩 [${port}] First-run do Chrome detectado. Contornando... (${i}/${attempts})`);

    // tenta por texto
    await tryByTextFirstRun(port);

    // se ainda estiver preso, tenta swipe (às vezes o botão não está totalmente visível)
    if (await isChromeFirstRun(port)) {
      await swipeUpSmall(port);
      await delay(600);
    }

    // fallback por posição proporcional
    await tryByPositionFirstRun(port);

    // settle
    await delay(800);
  }

  // não conseguiu sair do first-run
  return false;
}
