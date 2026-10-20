/// <reference lib="webworker" />
import { convert } from '../engine/convert'
import { autoAdjust } from '../engine/autoAdjust'
import { gridSize } from '../engine/layout'
import type { FromWorker, ToWorker } from '../lib/converter'

let bitmap: ImageBitmap | null = null

function post(m: FromWorker, transfer: Transferable[] = []) {
  ;(self as unknown as Worker).postMessage(m, transfer)
}

function ctx2d(w: number, h: number) {
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('2D canvas unavailable')
  ctx.imageSmoothingQuality = 'high'
  return ctx
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  if (msg.type === 'image') {
    bitmap?.close()
    bitmap = msg.bitmap
    return
  }
  try {
    if (!bitmap) throw new Error('No image loaded')
    if (msg.type === 'convert') {
      const { settings, cellAspect } = msg
      const plan = gridSize(bitmap.width, bitmap.height, settings.layout, cellAspect)
      const { cols, rows, crop } = plan
      const ctx = ctx2d(cols, rows)
      if (settings.layout.flipH) {
        ctx.translate(cols, 0)
        ctx.scale(-1, 1)
      }
      ctx.drawImage(bitmap, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows)
      const data = ctx.getImageData(0, 0, cols, rows).data
      const grid = convert(data, cols, rows, settings.look)
      post({ type: 'grid', id: msg.id, grid, plan }, [grid.index.buffer, grid.rgb.buffer])
    } else if (msg.type === 'auto') {
      const w = 200
      const h = Math.max(1, Math.round((200 * bitmap.height) / bitmap.width))
      const ctx = ctx2d(w, h)
      ctx.drawImage(bitmap, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h).data
      post({ type: 'auto', id: msg.id, result: autoAdjust(data, w, h) })
    }
  } catch (err) {
    post({ type: 'error', id: (msg as { id?: number }).id ?? 0, message: err instanceof Error ? err.message : String(err) })
  }
}
