import type { VideoInfo } from './probe'

/** One decoded frame in display orientation (rotation applied exactly once). */
export interface ReaderFrame {
  time: number
  image: CanvasImageSource
  width: number
  height: number
  /** Releases the frame; it must not be drawn after this. */
  close(): void
}

export interface FrameReader {
  readonly kind: 'webcodecs' | 'seek'
  /** Yields one frame per requested time, in order. Stops early once `signal` aborts. */
  frames(times: number[], signal: AbortSignal): AsyncIterable<ReaderFrame>
}

/** Decodes with WebCodecs through Mediabunny's CanvasSink. The sink applies the track's rotation
 * metadata by default, so frames come out display-sized like the <video> preview; no rotation option
 * is passed, or it would be applied on top. */
export async function webCodecsReader(file: Blob): Promise<FrameReader> {
  const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import('mediabunny')
  return {
    kind: 'webcodecs',
    async *frames(times, signal) {
      const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
      try {
        const track = await input.getPrimaryVideoTrack()
        if (!track) throw new Error("Couldn't read that video.")
        // A pool of two keeps VRAM flat; a frame is only drawn before the next one is requested.
        const sink = new CanvasSink(track, { poolSize: 2 })
        let index = 0
        for await (const wrapped of sink.canvasesAtTimestamps(times.values())) {
          if (signal.aborted) return
          let canvas = wrapped?.canvas ?? null
          if (!canvas) {
            // Null means "before the first frame" (video that starts a little late): show the first frame.
            canvas = (await sink.getCanvas(await track.getFirstTimestamp()))?.canvas ?? null
          }
          if (!canvas) throw new Error("Couldn't read that video.")
          const time = times[index++]
          yield { time, image: canvas, width: canvas.width, height: canvas.height, close() {} }
        }
      } finally {
        input.dispose()
      }
    },
  }
}

/** For clips the browser plays but WebCodecs can't decode (e.g. HEVC without WebCodecs support): steps
 * a hidden <video>, which already presents frames in display orientation. Slower but always works. */
export function seekReader(file: Blob): FrameReader {
  return {
    kind: 'seek',
    async *frames(times, signal) {
      const url = URL.createObjectURL(file)
      const video = document.createElement('video')
      video.muted = true
      video.playsInline = true
      video.preload = 'auto'
      // Attached but invisible: some browsers don't decode frames for detached videos.
      Object.assign(video.style, { position: 'fixed', left: '0', top: '0', width: '1px', height: '1px', opacity: '0', pointerEvents: 'none' })
      video.src = url
      document.body?.appendChild(video)
      try {
        await waitFor(video, 'loadeddata', signal)
        for (const time of times) {
          if (signal.aborted) return
          // Already there (the first frame, or two times on one position): WebKit fires no `seeked`
          // for a seek that doesn't move, so waiting would hang.
          const there = Math.abs(video.currentTime - time) < 1e-6 && video.readyState >= 2
          if (!there) {
            const seeked = waitFor(video, 'seeked', signal)
            video.currentTime = time
            await seeked
          }
          if (signal.aborted) return
          const bitmap = await createImageBitmap(video)
          yield { time, image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() }
        }
      } finally {
        video.removeAttribute('src')
        video.load()
        video.remove()
        URL.revokeObjectURL(url)
      }
    },
  }
}

/** How long one load or seek may take before the clip counts as unreadable. Generous, because a
 * phone seeking through HEVC can be slow. */
export const SEEK_TIMEOUT_MS = 10_000

/** Resolves on `type`; rejects on a media error or after SEEK_TIMEOUT_MS. A timeout fails the export
 * rather than reusing the current frame: silently repeating a stale frame would ship a wrong video
 * with no sign anything went wrong. An abort resolves so the caller can stop cleanly. */
function waitFor(video: HTMLVideoElement, type: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fn: () => void) => () => {
      clearTimeout(timer)
      video.removeEventListener(type, ok)
      video.removeEventListener('error', fail)
      signal.removeEventListener('abort', ok)
      fn()
    }
    const ok = done(resolve)
    const fail = done(() => reject(new Error("Couldn't read that video.")))
    const timer = setTimeout(fail, SEEK_TIMEOUT_MS)
    video.addEventListener(type, ok)
    video.addEventListener('error', fail)
    signal.addEventListener('abort', ok)
  })
}

/** WebCodecs when it can decode the clip, otherwise the <video> fallback (spec 4.6 decode rule). */
export async function pickReader(file: Blob, info: VideoInfo): Promise<FrameReader> {
  return info.canDecode ? webCodecsReader(file) : seekReader(file)
}
