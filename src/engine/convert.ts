import { cellColor } from './color'
import { blendEdges, sobel } from './edges'
import { glyphIndex, rampFor } from './ramp'
import { adjustRGB, luminance } from './tone'
import type { Grid, LookSettings } from './types'

/** `rgba` is already one pixel per cell (cols x rows), cropped and flipped. */
export function convert(rgba: Uint8ClampedArray, cols: number, rows: number, look: LookSettings): Grid {
  const n = cols * rows
  // Composite over black first; never mutate the caller's buffer.
  const px = new Uint8ClampedArray(n * 4)
  for (let p = 0; p < n; p++) {
    const o = p * 4
    const a = rgba[o + 3] / 255
    px[o] = rgba[o] * a
    px[o + 1] = rgba[o + 1] * a
    px[o + 2] = rgba[o + 2] * a
    px[o + 3] = 255
  }
  if (look.edges) {
    const gray = new Uint8Array(n)
    for (let p = 0; p < n; p++) {
      const o = p * 4
      gray[p] = Math.round(luminance(px[o], px[o + 1], px[o + 2]))
    }
    blendEdges(px, sobel(gray, cols, rows), look.edgeIntensity / 100)
  }
  const glyphs = rampFor(look)
  const index = new Uint16Array(n)
  const rgb = new Uint8Array(n * 3)
  const adj = new Uint8Array(3)
  const col = new Uint8Array(3)
  for (let p = 0; p < n; p++) {
    const o = p * 4
    adjustRGB(px[o], px[o + 1], px[o + 2], look, adj)
    const L = luminance(adj[0], adj[1], adj[2])
    index[p] = glyphIndex(L, glyphs.length, look.invert)
    cellColor(look, [adj[0], adj[1], adj[2]], L, col)
    rgb.set(col, p * 3)
  }
  return { cols, rows, glyphs, index, rgb }
}
