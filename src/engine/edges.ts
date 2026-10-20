/** 3x3 Sobel magnitude, min(255, hypot(gx, gy)); neighbours clamp at borders. */
export function sobel(gray: Uint8Array, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const ym = Math.max(0, y - 1) * w
    const y0 = y * w
    const yp = Math.min(h - 1, y + 1) * w
    for (let x = 0; x < w; x++) {
      const xm = Math.max(0, x - 1)
      const xp = Math.min(w - 1, x + 1)
      const a = gray[ym + xm], b = gray[ym + x], c = gray[ym + xp]
      const d = gray[y0 + xm], f = gray[y0 + xp]
      const g = gray[yp + xm], hh = gray[yp + x], i = gray[yp + xp]
      const gx = c + 2 * f + i - (a + 2 * d + g)
      const gy = g + 2 * hh + i - (a + 2 * b + c)
      out[y0 + x] = Math.min(255, Math.sqrt(gx * gx + gy * gy))
    }
  }
  return out
}

/** In place: rgb = rgb*(1-k) + edge*k. Alpha untouched. */
export function blendEdges(rgba: Uint8ClampedArray, edge: Uint8Array, k: number): void {
  for (let p = 0; p < edge.length; p++) {
    const o = p * 4
    const e = edge[p] * k
    rgba[o] = rgba[o] * (1 - k) + e
    rgba[o + 1] = rgba[o + 1] * (1 - k) + e
    rgba[o + 2] = rgba[o + 2] * (1 - k) + e
  }
}
