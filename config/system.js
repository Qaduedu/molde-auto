function envBool(name, fallback) {
  const v = process.env[name];
  if (v == null) return fallback;
  return !["0", "false", "no", "off"].includes(String(v).toLowerCase().trim());
}

function envNum(name, fallback) {
  const v = process.env[name];
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const SYSTEM = {
  MAX_DEVICES: envNum("MAX_DEVICES", 5),
  EMU_MEMORY_MB: envNum("EMU_MEMORY_MB", 1024),
  EMU_CORES: envNum("EMU_CORES", 1),

  LOG_HOST_PUBLIC_IP: envBool("LOG_HOST_PUBLIC_IP", true),
  HOST_CONNECTIVITY_CHECK: envBool("HOST_CONNECTIVITY_CHECK", true),

  // waits (defaults = seu arquivo)
  FIRST_PAGE_WAIT_MS: envNum("FIRST_PAGE_WAIT_MS", 3850),
  PAGE_WAIT_MS: envNum("PAGE_WAIT_MS", 1625),
  BETWEEN_PAGES_MS: envNum("BETWEEN_PAGES_MS", 205),

  // prints (defaults = ON, como você quer)
  TAKE_SCREENSHOT_EACH_PAGE: envBool("TAKE_SCREENSHOT_EACH_PAGE", true),
  SCREENSHOT_SETTLE_MS: envNum("SCREENSHOT_SETTLE_MS", 300),

  // restart chrome
  RESTART_CHROME_BETWEEN_PAGES: envBool("RESTART_CHROME_BETWEEN_PAGES", true),
  RESTART_CHROME_EVERY_N_PAGES: envNum("RESTART_CHROME_EVERY_N_PAGES", 100),

  // se você usa essas flags em algum lugar, ficam configuráveis
  CLEAR_CHROME_AT_FLOW_START: envBool("CLEAR_CHROME_AT_FLOW_START", true),
  CLEAR_CHROME_AT_FLOW_END: envBool("CLEAR_CHROME_AT_FLOW_END", true),

  ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT || null,
};
