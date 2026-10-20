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

/** Most rows a grid may have: very tall images (a 1x4096 strip) would otherwise ask for millions of
 * cells. Fill frames never reach it (9:16 is about 1.07 rows per column). */
export function maxRows(cols: number): number {
  return Math.max(cols * 4, 400)
}

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

  let rows = Math.max(1, Math.round((cols * cellAspect) / ratio))
  const cap = maxRows(cols)
  if (rows > cap) {
    // Too tall: keep the centre band whose shape fits the cap, so cells keep their aspect.
    const sh = Math.min(crop.sh, Math.max(1, Math.floor((crop.sw * cap) / (cols * cellAspect))))
    crop = { sx: crop.sx, sy: crop.sy + Math.round((crop.sh - sh) / 2), sw: crop.sw, sh }
    rows = Math.min(cap, Math.max(1, Math.round((cols * cellAspect * sh) / crop.sw)))
  }
  return { cols, rows, crop }
}

export function exportSize(layout: LayoutSettings, plan: GridPlan, cellAspect: number): [number, number] {
  if (layout.frame !== 'original') return FRAME_SIZES[layout.frame]
  const w = plan.cols * cellAspect
  const h = plan.rows
  const k = ORIGINAL_LONG_EDGE / Math.max(w, h)
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))]
}
