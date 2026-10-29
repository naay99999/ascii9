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

export const VIDEO_LONG_EDGE = 1920
export const GIF_LONG_EDGE = 720
export const VIDEO_FPS_CAP = 30
export const GIF_FPS_CAP = 15

const even = (n: number) => Math.max(2, Math.round(n / 2) * 2)

/** Video frame size: the image table with 16:9 at 1920x1080 and Original capped at 1920; sides are even. */
export function videoExportSize(layout: LayoutSettings, plan: GridPlan, cellAspect: number): [number, number] {
  if (layout.frame === '16:9') return [1920, 1080]
  if (layout.frame !== 'original') {
    const [w, h] = exportSize(layout, plan, cellAspect)
    return [even(w), even(h)]
  }
  const w = plan.cols * cellAspect
  const h = plan.rows
  const k = VIDEO_LONG_EDGE / Math.max(w, h)
  return [even(w * k), even(h * k)]
}

/** Scale down so the long edge is at most GIF_LONG_EDGE; never upscales. */
export function gifSize(size: [number, number]): [number, number] {
  const k = Math.min(1, GIF_LONG_EDGE / Math.max(size[0], size[1]))
  return [Math.max(1, Math.round(size[0] * k)), Math.max(1, Math.round(size[1] * k))]
}

/** Source fps capped at `cap`; unknown or invalid sources use the cap. */
export function outputFps(sourceFps: number | null, cap: number): number {
  return sourceFps && sourceFps > 0 ? Math.min(sourceFps, cap) : cap
}

/** Sample times in seconds, at least one frame. */
export function frameTimes(duration: number, fps: number): number[] {
  const n = Math.max(1, Math.ceil(duration * fps - 1e-6))
  return Array.from({ length: n }, (_, i) => i / fps)
}

/** Per-frame GIF delays in ms. A GIF stores whole centiseconds, so each delay is rounded against the
 * running total rather than on its own: at 15 fps the frames alternate 70/60 ms instead of all being
 * 70 ms, and the GIF lasts as long as the clip. */
export function gifDelays(count: number, fps: number): number[] {
  const out: number[] = []
  let prev = 0
  for (let i = 1; i <= count; i++) {
    const cs = Math.round((i * 100) / fps)
    out.push(Math.max(1, cs - prev) * 10)
    prev = cs
  }
  return out
}

