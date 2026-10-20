import type { Frame, LayoutSettings } from './types'

export const FRAME_SIZES: Record<Exclude<Frame, 'original'>, [number, number]> = {
  '1:1': [1080, 1080],
  '4:5': [1080, 1350],
  '9:16': [1080, 1920],
  '16:9': [2560, 1440],
}

export interface GridPlan {
  cols: number
  rows: number
  crop: { sx: number; sy: number; sw: number; sh: number }
}

const ORIGINAL_LONG_EDGE = 2048

/** cellAspect = cell width / cell height (about 0.6). */
export function gridSize(imgW: number, imgH: number, layout: LayoutSettings, cellAspect: number): GridPlan {
  const cols = Math.max(1, Math.round(layout.detail))
  let crop = { sx: 0, sy: 0, sw: imgW, sh: imgH }
  let ratio = imgW / imgH

  if (layout.frame !== 'original' && layout.fit === 'fill') {
    const [fw, fh] = FRAME_SIZES[layout.frame]
    const r = fw / fh
    if (imgW / imgH > r) {
      const sw = Math.min(imgW, Math.max(1, Math.round(imgH * r)))
      crop = { sx: Math.round((imgW - sw) / 2), sy: 0, sw, sh: imgH }
    } else {
      const sh = Math.min(imgH, Math.max(1, Math.round(imgW / r)))
      crop = { sx: 0, sy: Math.round((imgH - sh) / 2), sw: imgW, sh }
    }
    ratio = r
  }

  const rows = Math.max(1, Math.round((cols * cellAspect) / ratio))
  return { cols, rows, crop }
}

export function exportSize(layout: LayoutSettings, plan: GridPlan, cellAspect: number): [number, number] {
  if (layout.frame !== 'original') return FRAME_SIZES[layout.frame]
  const w = plan.cols * cellAspect
  const h = plan.rows
  const k = ORIGINAL_LONG_EDGE / Math.max(w, h)
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]
}
