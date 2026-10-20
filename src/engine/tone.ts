import type { LookSettings } from './types'

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v)

export function luminance(r: number, g: number, b: number): number {
  return 0.299 * r + 0.587 * g + 0.114 * b
}

/** Gamma, brightness, contrast, clamp, then saturation (image mode only).
 * Writes integers 0-255 into out[0..2]. */
export function adjustRGB(r: number, g: number, b: number, look: LookSettings, out: Uint8Array): void {
  const shift = look.brightness * 2.55
  const cf = (100 + look.contrast) / 100
  const tone = (v: number) => {
    let x = Math.pow(v / 255, look.gamma) * 255
    x += shift
    x = ((x / 255 - 0.5) * cf + 0.5) * 255
    return clamp255(x)
  }
  let R = tone(r)
  let G = tone(g)
  let B = tone(b)
  if (look.colorMode === 'image') {
    const gray = luminance(R, G, B)
    const s = look.saturation / 100
    R = clamp255(gray + (R - gray) * s)
    G = clamp255(gray + (G - gray) * s)
    B = clamp255(gray + (B - gray) * s)
  }
  out[0] = Math.round(R)
  out[1] = Math.round(G)
  out[2] = Math.round(B)
}
