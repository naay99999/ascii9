import type { CanvasSource, Input, InputAudioTrack, Quality } from 'mediabunny'
import { gridFromSource, type Ctx2D } from '../engine/sample'
import { frameTimes, gridSize, outputFps, VIDEO_FPS_CAP, videoExportSize } from '../engine/layout'
import type { Settings } from '../engine/types'
import { drawGrid } from '../render/drawGrid'
import { audioPlan, type AudioPlan } from './audioPlan'
import type { VideoInfo } from './probe'
import type { FrameReader, ReaderFrame } from './readers'
import type { ExportSupport } from './support'

export interface VideoJob {
  file: Blob
  info: VideoInfo
  settings: Settings
  cellAspect: number
  container: 'mp4' | 'webm'
  sound: boolean
  support: ExportSupport
}

/** The clip's sound, when the export keeps it. */
export interface AudioFeed {
  file: Blob
  plan: Exclude<AudioPlan, 'none'>
  /** Clip length in seconds; audio past it is dropped. */
  duration: number
}

export interface VideoSink {
  /** Encodes the canvas as it is now, at `t` for `d` seconds. Always the same canvas. */
  add(canvas: OffscreenCanvas | HTMLCanvasElement, t: number, d: number): Promise<void>
  finish(): Promise<Blob>
  cancel(): Promise<void>
}

export type VideoSinkFactory = (
  size: [number, number],
  fps: number,
  container: 'mp4' | 'webm',
  media: { codec: 'avc' | 'vp9' | 'vp8'; audio: AudioFeed | null },
) => VideoSink | Promise<VideoSink>

export type AnyCanvas = OffscreenCanvas | HTMLCanvasElement

export function makeCanvas(w: number, h: number): AnyCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return c
}

export function context(canvas: AnyCanvas, readBack: boolean): Ctx2D {
  const ctx = canvas.getContext('2d', readBack ? { willReadFrequently: true } : undefined) as Ctx2D | null
  if (!ctx) throw new Error('2D canvas unavailable')
  return ctx
}

/** A `makeCtx` for gridFromSource that reuses one small canvas while the grid size stays the same,
 * instead of allocating one per frame. */
export function frameSampler(): (w: number, h: number) => Ctx2D {
  let ctx: Ctx2D | null = null
  return (w, h) => {
    if (!ctx || ctx.canvas.width !== w || ctx.canvas.height !== h) {
      ctx = context(makeCanvas(w, h), true)
      ctx.imageSmoothingQuality = 'high'
    }
    // gridFromSource mirrors with translate/scale; start each frame from a clean transform.
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    return ctx
  }
}

/** One output frame: the same sample → convert → drawGrid path as a photo export. Shared with GIF. */
export function renderFrame(
  out: Ctx2D,
  size: [number, number],
  frame: Pick<ReaderFrame, 'image' | 'width' | 'height'>,
  settings: Settings,
  cellAspect: number,
  sample: (w: number, h: number) => Ctx2D,
): void {
  const { grid } = gridFromSource(frame.image, frame.width, frame.height, settings, cellAspect, sample)
  drawGrid(out, grid, size[0], size[1], cellAspect)
}

/** Canvas text never starts the @font-face download on its own; without this the first frames
 * could be drawn in a fallback face. */
export async function loadExportFont(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  await document.fonts.load('400 16px "JetBrains Mono"').catch(() => undefined) // taste-skill-ignore: the ASCII art itself is set in a monospace face (spec 4.2)
  await document.fonts.ready
}

/** Lets Cancel clicks and progress repaints through between frames. */
export const yieldToEventLoop = () => new Promise<void>((r) => setTimeout(r, 0))

export const aborted = () => new DOMException('Aborted', 'AbortError')

/** Renders every output frame of the clip as ASCII and encodes it to MP4 or WebM, with the original
 * sound when asked for and possible. */
export async function exportVideo(
  job: VideoJob,
  opts: { reader: FrameReader; onProgress(p: number): void; signal: AbortSignal; sink?: VideoSinkFactory },
): Promise<Blob> {
  const { info, settings, cellAspect, container, support } = job
  const { signal } = opts
  if (signal.aborted) throw aborted()
  const size = videoExportSize(settings.layout, gridSize(info.width, info.height, settings.layout, cellAspect), cellAspect)
  const fps = outputFps(info.fps, VIDEO_FPS_CAP)
  const times = frameTimes(info.duration, fps)
  const plan = audioPlan(info.audio, container, job.sound, container === 'mp4' ? support.aacEncode : support.opusEncode)
  const audio: AudioFeed | null = plan === 'none' ? null : { file: job.file, plan, duration: info.duration }
  const codec = container === 'mp4' ? 'avc' : (support.webmCodec ?? 'vp9')

  await loadExportFont()
  const canvas = makeCanvas(size[0], size[1])
  const out = context(canvas, false)
  const sample = frameSampler()
  const sink = await (opts.sink ?? mediabunnySink)(size, fps, container, { codec, audio })

  try {
    let i = 0
    for await (const frame of opts.reader.frames(times, signal)) {
      try {
        if (signal.aborted) break
        renderFrame(out, size, frame, settings, cellAspect, sample)
      } finally {
        frame.close()
      }
      // Use the planned time, not the frame's: output timestamps must be evenly spaced.
      await sink.add(canvas, times[i], 1 / fps)
      i++
      opts.onProgress(i / times.length)
      await yieldToEventLoop()
      if (signal.aborted || i >= times.length) break
    }
    if (signal.aborted) throw aborted()
    if (i < times.length) throw new Error("Couldn't read that video.")
    return await sink.finish()
  } catch (err) {
    await sink.cancel().catch(() => {})
    throw err
  }
}

type Mediabunny = typeof import('mediabunny')

interface AudioPump {
  source: import('mediabunny').AudioSource
  /** Feeds the whole clip's sound into `source`, then closes it. */
  run(stopped: () => boolean): Promise<void>
}

/** Opens the clip's sound for the output: packets passed through as-is ('copy') or decoded and
 * re-encoded to the container's codec ('encode'). Null when the track turns out unusable. */
async function openAudio(
  mb: Mediabunny,
  feed: AudioFeed,
  container: 'mp4' | 'webm',
  quality: Quality,
): Promise<AudioPump | null> {
  const input: Input = new mb.Input({ source: new mb.BlobSource(feed.file), formats: mb.ALL_FORMATS })
  const release = () => input.dispose()
  try {
    const track = await input.getPrimaryAudioTrack()
    const pump = track ? await audioPump(mb, track, feed, container, quality, release) : null
    if (!pump) release()
    return pump
  } catch (err) {
    release()
    throw err
  }
}

async function audioPump(
  mb: Mediabunny,
  track: InputAudioTrack,
  feed: AudioFeed,
  container: 'mp4' | 'webm',
  quality: Quality,
  release: () => void,
): Promise<AudioPump | null> {
  if (feed.plan === 'copy') {
    const [codec, decoderConfig] = await Promise.all([track.getCodec(), track.getDecoderConfig()])
    if (!codec || !decoderConfig) return null
    const source = new mb.EncodedAudioPacketSource(codec)
    return {
      source,
      async run(stopped) {
        try {
          let first = true
          for await (const packet of new mb.EncodedPacketSink(track).packets()) {
            if (stopped() || packet.timestamp >= feed.duration) break
            // The first packet carries the decoder config so the muxer can describe the track.
            await source.add(packet, first ? { decoderConfig } : undefined)
            first = false
          }
          source.close()
        } finally {
          release()
        }
      },
    }
  }

  const channels = await track.getNumberOfChannels()
  const source = new mb.AudioSampleSource({
    codec: container === 'mp4' ? 'aac' : 'opus',
    quality,
    // Opus encoders take 48 kHz; both encoders are safest with at most stereo.
    transform: { numberOfChannels: Math.min(2, channels), ...(container === 'webm' ? { sampleRate: 48000 } : {}) },
  })
  return {
    source,
    async run(stopped) {
      try {
        for await (const s of new mb.AudioSampleSink(track).samples(0, feed.duration)) {
          try {
            if (stopped()) break
            await source.add(s)
          } finally {
            s.close()
          }
        }
        source.close()
      } finally {
        release()
      }
    },
  }
}

/** The real encoder: Mediabunny Output into memory, video from the export canvas, sound alongside. */
export const mediabunnySink: VideoSinkFactory = async (size, fps, container, { codec, audio }) => {
  const mb = await import('mediabunny')
  const format =
    container === 'mp4' ? new mb.Mp4OutputFormat({ fastStart: 'in-memory' }) : new mb.WebMOutputFormat()
  const output = new mb.Output({ format, target: new mb.BufferTarget() })
  const quality = new mb.Quality('high')
  let video: CanvasSource | null = null
  let bound: AnyCanvas | null = null
  let pump: Promise<void> | null = null
  let pumpError: unknown = null
  let stopped = false

  // CanvasSource is tied to one canvas, which only arrives with the first frame, so the output
  // starts then.
  async function start(canvas: AnyCanvas): Promise<void> {
    bound = canvas
    video = new mb.CanvasSource(canvas, { codec, quality })
    output.addVideoTrack(video, { frameRate: fps })
    const sound = audio ? await openAudio(mb, audio, container, quality) : null
    if (sound) output.addAudioTrack(sound.source)
    await output.start()
    // Runs alongside the video frames; the muxer interleaves the two tracks.
    pump = sound?.run(() => stopped).catch((e) => void (pumpError = e)) ?? null
  }

  return {
    async add(canvas, t, d) {
      if (!video) await start(canvas)
      else if (canvas !== bound) throw new Error('VideoSink.add needs the same canvas every frame')
      await video!.add(t, d)
    },
    async finish() {
      video?.close()
      await pump
      if (pumpError) throw pumpError
      await output.finalize()
      const buffer = output.target.buffer
      if (!buffer) throw new Error('Export failed')
      return new Blob([buffer], { type: format.mimeType })
    },
    async cancel() {
      stopped = true
      if (output.state === 'pending' || output.state === 'started') await output.cancel()
      await pump
    },
  }
}
