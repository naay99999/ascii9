import type { Grid } from '../engine/types'

export interface TextLayout { fontSize: number; cellW: number; cellH: number; x0: number; y0: number }

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

/** Margin is 4% of the short side; the grid is scaled to fit the rest and centred. */
export function layoutText(cols: number, rows: number, W: number, H: number, cellAspect: number): TextLayout {
  const margin = 0.04 * Math.min(W, H)
  const availW = Math.max(1, W - 2 * margin)
  const availH = Math.max(1, H - 2 * margin)
  const fontSize = Math.min(availW / (cols * cellAspect), availH / rows)
  const cellW = fontSize * cellAspect
  const cellH = fontSize
  return { fontSize, cellW, cellH, x0: (W - cellW * cols) / 2, y0: (H - cellH * rows) / 2 }
}

/** Shade glyphs (U+2591-2593, U+2588) are not in the bundled JetBrains Mono subsets, so they would
 * fall back to a system font whose blocks vary by OS and need not fill the 1 em cell. They are
 * painted as whole-cell rects at the matching coverage instead; TXT export keeps the glyphs. */
const SHADE_ALPHA: Record<string, number> = { '\u2591': 0.25, '\u2592': 0.5, '\u2593': 0.75, '\u2588': 1 }

/** Single renderer shared by the preview and exports. Every glyph is placed at
 * its own cell origin so wide or non-monospace glyphs cannot drift the layout. */
export function drawGrid(ctx: Ctx, grid: Grid, W: number, H: number, cellAspect: number): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  const { fontSize, cellW, cellH, x0, y0 } = layoutText(grid.cols, grid.rows, W, H, cellAspect)
  ctx.font = `${fontSize}px "JetBrains Mono"` // taste-skill-ignore: the ASCII art itself is set in a monospace face (spec 4.2)
  ctx.textBaseline = 'top'
  const alpha0 = ctx.globalAlpha
  let alpha = alpha0
  let last = ''
  for (let r = 0; r < grid.rows; r++) {
    const y = y0 + r * cellH
    for (let c = 0; c < grid.cols; c++) {
      const i = r * grid.cols + c
      const glyph = grid.glyphs[grid.index[i]]
      if (glyph === undefined || glyph === ' ') continue
      const fill = `rgb(${grid.rgb[i * 3]},${grid.rgb[i * 3 + 1]},${grid.rgb[i * 3 + 2]})`
      if (fill !== last) { ctx.fillStyle = fill; last = fill }
      const shade = SHADE_ALPHA[glyph]
      if (shade !== undefined) {
        if (shade !== alpha) { ctx.globalAlpha = shade; alpha = shade }
        // Snap both edges to whole pixels so neighbouring blocks meet with no hairline gap or overlap.
        const xa = Math.round(x0 + c * cellW)
        const ya = Math.round(y)
        ctx.fillRect(xa, ya, Math.round(x0 + (c + 1) * cellW) - xa, Math.round(y + cellH) - ya)
      } else {
        if (alpha !== 1) { ctx.globalAlpha = 1; alpha = 1 }
        ctx.fillText(glyph, x0 + c * cellW, y)
      }
    }
  }
  ctx.globalAlpha = alpha0
}
