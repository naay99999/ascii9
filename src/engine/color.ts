import type { LookSettings } from './types'

export function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16) || 0
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** Cell colour for the look's colour mode. Invert only affects duotone's t. */
export function cellColor(look: LookSettings, rgb: [number, number, number], L: number, out: Uint8Array): void {
  let c: [number, number, number]
  if (look.colorMode === 'mono') c = parseHex(look.monoColor)
  else if (look.colorMode === 'image') c = rgb
  else {
    const a = parseHex(look.duo1)
    const b = parseHex(look.duo2)
    const t = (look.invert ? 255 - L : L) / 255
    c = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  }
  out[0] = Math.round(c[0])
  out[1] = Math.round(c[1])
  out[2] = Math.round(c[2])
}
