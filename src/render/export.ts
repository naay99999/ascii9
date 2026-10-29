import type { Grid } from '../engine/types'
import { drawGrid } from './drawGrid'

export function gridToText(grid: Grid): string {
  const lines: string[] = []
  for (let r = 0; r < grid.rows; r++) {
    let line = ''
    for (let c = 0; c < grid.cols; c++) line += grid.glyphs[grid.index[r * grid.cols + c]] ?? ' '
    lines.push(line)
  }
  return lines.join('\n')
}

export function fileName(ext: 'png' | 'jpg' | 'txt' | 'mp4' | 'webm' | 'gif', d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `ascii9-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.${ext}`
}

export async function exportImage(
  grid: Grid,
  size: [number, number],
  cellAspect: number,
  type: 'image/png' | 'image/jpeg',
): Promise<Blob> {
  const [W, H] = size
  if (typeof document !== 'undefined' && document.fonts) {
    // Canvas text alone never starts the @font-face download: request it explicitly.
    await document.fonts.load('400 16px "JetBrains Mono"').catch(() => undefined) // taste-skill-ignore: the ASCII art itself is set in a monospace face (spec 4.2)
    await document.fonts.ready
  }
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(W, H)
    const ctx = canvas.getContext('2d')
    if (ctx) {
      drawGrid(ctx, grid, W, H, cellAspect)
      return canvas.convertToBlob({ type, quality: 0.95 })
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  drawGrid(ctx, grid, W, H, cellAspect)
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), type, 0.95),
  )
}
