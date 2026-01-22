const AVD_NAME = process.env.AVD_NAME || "Pixel_2_XL";
const MAX = Number(process.env.MAX_DEVICES || 5);
const BASE_PORT = Number(process.env.BASE_PORT || 5554);

export const emulators = Array.from({ length: MAX }, (_, i) => ({
  port: BASE_PORT + i * 2,
  avd: AVD_NAME,
}));
