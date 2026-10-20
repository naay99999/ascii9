import { luminance } from './tone'

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** PRD 4.4. `rgba` is the image already downsampled (about 200 px wide). */
export function autoAdjust(
  rgba: Uint8ClampedArray,
  w: number,
  h: number,
): { brightness: number; contrast: number; gamma: number } {
  const total = w * h
  const hist = new Uint32Array(256)
  let sum = 0
  for (let p = 0; p < total; p++) {
    const o = p * 4
    const L = Math.round(luminance(rgba[o], rgba[o + 1], rgba[o + 2]))
    hist[L]++
    sum += L
  }
  const mean = total > 0 ? sum / total / 255 : 0.5
  const ignore = Math.floor(total * 0.01)
  let min = 0
  let max = 255
  let cum = 0
  for (let i = 0; i < 256; i++) {
    cum += hist[i]
    if (cum > ignore) { min = i; break }
  }
  cum = 0
  for (let i = 255; i >= 0; i--) {
    cum += hist[i]
    if (cum > ignore) { max = i; break }
  }
  const range = max - min
  const brightness = clamp(Math.round(((128 - (min + max) / 2) / 255) * 100), -50, 50)
  const contrast = clamp(Math.round((220 / Math.max(range, 1) - 1) * 50), -30, 60)
  let gamma = 1
  if (mean < 0.4) gamma = 0.7 + mean * 0.5
  else if (mean > 0.6) gamma = 1 + (mean - 0.6) * 1.5
  gamma = Math.round(clamp(gamma, 0.5, 2) * 10) / 10
  return { brightness, contrast, gamma }
}
