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

/** Single renderer shared by the preview and exports. Every glyph is placed at
 * its own cell origin so wide or non-monospace glyphs cannot drift the layout. */
export function drawGrid(ctx: Ctx, grid: Grid, W: number, H: number, cellAspect: number): void {
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)
  const { fontSize, cellW, cellH, x0, y0 } = layoutText(grid.cols, grid.rows, W, H, cellAspect)
  ctx.font = `${fontSize}px "JetBrains Mono"`
  ctx.textBaseline = 'top'
  let last = ''
  for (let r = 0; r < grid.rows; r++) {
    const y = y0 + r * cellH
    for (let c = 0; c < grid.cols; c++) {
      const i = r * grid.cols + c
      const glyph = grid.glyphs[grid.index[i]]
      if (glyph === undefined || glyph === ' ') continue
      const fill = `rgb(${grid.rgb[i * 3]},${grid.rgb[i * 3 + 1]},${grid.rgb[i * 3 + 2]})`
      if (fill !== last) { ctx.fillStyle = fill; last = fill }
      ctx.fillText(glyph, x0 + c * cellW, y)
    }
  }
}
