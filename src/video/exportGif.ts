import { frameTimes, GIF_FPS_CAP, gifSize, gridSize, outputFps, videoExportSize } from '../engine/layout'
import {
  aborted,
  context,
  frameSampler,
  loadExportFont,
  makeCanvas,
  renderFrame,
  yieldToEventLoop,
  type VideoJob,
} from './exportVideo'
import type { FrameReader } from './readers'

/** Renders the clip as a looping GIF: at most GIF_FPS_CAP fps, long edge capped, no sound. The
 * encoder is loaded on demand so it stays out of the initial bundle. */
export async function exportGif(
  job: Pick<VideoJob, 'file' | 'info' | 'settings' | 'cellAspect'>,
  opts: { reader: FrameReader; onProgress(p: number): void; signal: AbortSignal },
): Promise<Blob> {
  const { info, settings, cellAspect } = job
  const { signal } = opts
  if (signal.aborted) throw aborted()
  const full = videoExportSize(settings.layout, gridSize(info.width, info.height, settings.layout, cellAspect), cellAspect)
  const size = gifSize(full)
  const fps = outputFps(info.fps, GIF_FPS_CAP)
  const times = frameTimes(info.duration, fps)
  const delay = Math.round(1000 / fps)

  const { GIFEncoder, quantize, applyPalette } = await import('gifenc')
  await loadExportFont()
  const out = context(makeCanvas(size[0], size[1]), true)
  const sample = frameSampler()
  const gif = GIFEncoder()

  let i = 0
  for await (const frame of opts.reader.frames(times, signal)) {
    try {
      if (signal.aborted) break
      renderFrame(out, size, frame, settings, cellAspect, sample)
    } finally {
      frame.close()
    }
    const { data } = out.getImageData(0, 0, size[0], size[1])
    const palette = quantize(data, 256)
    // repeat: 0 loops forever; it is written once, with the first frame.
    gif.writeFrame(applyPalette(data, palette), size[0], size[1], { palette, delay, ...(i === 0 ? { repeat: 0 } : {}) })
    i++
    opts.onProgress(i / times.length)
    await yieldToEventLoop()
    if (signal.aborted || i >= times.length) break
  }
  if (signal.aborted) throw aborted()
  if (i < times.length) throw new Error("Couldn't read that video.")
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}
