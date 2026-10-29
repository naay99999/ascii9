import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/engine/defaults'
import { gridSize, videoExportSize } from '../../src/engine/layout'
import type { VideoInfo } from '../../src/video/probe'
import type { FrameReader, ReaderFrame } from '../../src/video/readers'
import type { ExportSupport } from '../../src/video/support'

/** Records what the CanvasSink mock was built with; the mock applies rotation the way Mediabunny
 * documents it (defaults to the track's rotation). */
const sinkOptions: unknown[] = []
vi.mock('mediabunny', () => {
  class Input {
    disposed = false
    async getPrimaryVideoTrack() {
      return { codedWidth: 1920, codedHeight: 1080, rotation: 90 }
    }
    dispose() {
      this.disposed = true
    }
  }
  class CanvasSink {
    w: number
    h: number
    constructor(track: { codedWidth: number; codedHeight: number; rotation: number }, opts?: { rotation?: number }) {
      sinkOptions.push(opts)
      const rot = opts?.rotation ?? track.rotation
      const turned = rot === 90 || rot === 270
      this.w = turned ? track.codedHeight : track.codedWidth
      this.h = turned ? track.codedWidth : track.codedHeight
    }
    async *canvasesAtTimestamps(ts: Iterable<number>) {
      for (const t of ts) yield { canvas: { width: this.w, height: this.h }, timestamp: t, duration: 1 / 30 }
    }
    async getCanvas(t: number) {
      return { canvas: { width: this.w, height: this.h }, timestamp: t, duration: 1 / 30 }
    }
  }
  return { Input, CanvasSink, BlobSource: class {}, ALL_FORMATS: [] }
})

const { exportVideo } = await import('../../src/video/exportVideo')
const { webCodecsReader, pickReader, seekReader, SEEK_TIMEOUT_MS } = await import('../../src/video/readers')

/** Minimal 2D context: enough for gridFromSource (sampling) and drawGrid (output). */
class FakeCtx {
  fillStyle = ''
  font = ''
  textBaseline = ''
  globalAlpha = 1
  imageSmoothingQuality = 'low'
  drawn = 0
  texts = 0
  constructor(public canvas: { width: number; height: number }) {}
  setTransform() {}
  translate() {}
  scale() {}
  fillRect() {}
  clearRect() {}
  drawImage() {
    this.drawn++
  }
  fillText() {
    this.texts++
  }
  getImageData(_x: number, _y: number, w: number, h: number) {
    return { data: new Uint8ClampedArray(w * h * 4).fill(200) }
  }
}
class FakeOffscreenCanvas {
  ctx: FakeCtx
  constructor(public width: number, public height: number) {
    this.ctx = new FakeCtx(this)
  }
  getContext() {
    return this.ctx
  }
}

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas)
  sinkOptions.length = 0
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const info = (over: Partial<VideoInfo> = {}): VideoInfo => ({
  duration: 1,
  width: 640,
  height: 360,
  fps: 60,
  rotation: 0,
  videoCodec: 'avc',
  canDecode: true,
  audio: null,
  ...over,
})
const support: ExportSupport = { mp4: true, webm: true, aacEncode: true, opusEncode: true, webmCodec: 'vp9' }
const settings = { ...DEFAULT_SETTINGS, layout: { ...DEFAULT_SETTINGS.layout, detail: 20 } }
const file = new Blob([])

function fakeReader(): FrameReader & { closed: number } {
  const r = {
    kind: 'webcodecs' as const,
    closed: 0,
    async *frames(times: number[], signal: AbortSignal): AsyncIterable<ReaderFrame> {
      for (const time of times) {
        if (signal.aborted) return
        yield { time, image: {} as CanvasImageSource, width: 640, height: 360, close: () => r.closed++ }
      }
    },
  }
  return r
}

function fakeSink() {
  const calls = {
    created: [] as unknown[][],
    add: [] as { canvas: unknown; t: number; d: number }[],
    finish: 0,
    cancel: 0,
  }
  const factory = vi.fn((...args: unknown[]) => {
    calls.created.push(args)
    return {
      async add(canvas: unknown, t: number, d: number) {
        calls.add.push({ canvas, t, d })
      },
      async finish() {
        calls.finish++
        return new Blob(['ok'], { type: 'video/mp4' })
      },
      async cancel() {
        calls.cancel++
      },
    }
  })
  return { factory, calls }
}

const job = (over: Partial<VideoInfo> = {}) => ({
  file,
  info: info(over),
  settings,
  cellAspect: 0.6,
  container: 'mp4' as const,
  sound: true,
  support,
})

describe('exportVideo', () => {
  it('video sink timestamps match frameTimes', async () => {
    const { factory, calls } = fakeSink()
    const reader = fakeReader()
    const blob = await exportVideo(job(), {
      reader,
      onProgress: () => {},
      signal: new AbortController().signal,
      sink: factory,
    })
    expect(await blob.text()).toBe('ok')
    expect(calls.add).toHaveLength(30)
    calls.add.forEach((c, i) => {
      expect(c.t).toBeCloseTo(i / 30)
      expect(c.d).toBeCloseTo(1 / 30)
    })
    const size = videoExportSize(settings.layout, gridSize(640, 360, settings.layout, 0.6), 0.6)
    expect(calls.created[0][0]).toEqual(size)
    expect(calls.created[0][1]).toBe(30)
    expect(calls.created[0][2]).toBe('mp4')
    expect(calls.created[0][3]).toEqual({ codec: 'avc', audio: null })
    // One reused canvas of the export size, with ASCII drawn on it.
    const canvas = calls.add[0].canvas as FakeOffscreenCanvas
    expect(calls.add.every((c) => c.canvas === canvas)).toBe(true)
    expect([canvas.width, canvas.height]).toEqual(size)
    expect(canvas.ctx.texts).toBeGreaterThan(0)
    expect(reader.closed).toBe(30)
    expect(calls.finish).toBe(1)
  })

  it('reports monotonic progress ending at 1', async () => {
    const { factory } = fakeSink()
    const seen: number[] = []
    await exportVideo(job({ duration: 0.5, fps: 24 }), {
      reader: fakeReader(),
      onProgress: (p) => seen.push(p),
      signal: new AbortController().signal,
      sink: factory,
    })
    expect(seen).toHaveLength(12)
    for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThan(seen[i - 1])
    expect(seen.at(-1)).toBe(1)
  })

  it('cancels on abort', async () => {
    const { factory, calls } = fakeSink()
    const ac = new AbortController()
    const run = exportVideo(job(), {
      reader: fakeReader(),
      onProgress: () => {
        if (calls.add.length === 3) ac.abort()
      },
      signal: ac.signal,
      sink: factory,
    })
    await expect(run).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls.add).toHaveLength(3)
    expect(calls.cancel).toBe(1)
    expect(calls.finish).toBe(0)
  })

  it('passes the audio plan to the sink', async () => {
    const { factory, calls } = fakeSink()
    const opts = { reader: fakeReader(), onProgress: () => {}, signal: new AbortController().signal, sink: factory }
    const aac = { codec: 'aac', sampleRate: 48000, channels: 2 }
    await exportVideo(job({ audio: aac }), opts)
    await exportVideo({ ...job({ audio: aac }), sound: false }, { ...opts, reader: fakeReader() })
    await exportVideo({ ...job({ audio: aac }), container: 'webm' }, { ...opts, reader: fakeReader() })
    expect(calls.created.map((c) => (c[3] as { audio: { plan: string } | null }).audio?.plan ?? 'none')).toEqual([
      'copy',
      'none',
      'encode',
    ])
  })
})

describe('readers', () => {
  it('reader frames are rotated like the preview', async () => {
    const reader = await webCodecsReader(file)
    const out: [number, number][] = []
    for await (const f of reader.frames([0, 1 / 30], new AbortController().signal)) {
      out.push([f.width, f.height])
      f.close()
    }
    expect(out).toEqual([
      [1080, 1920],
      [1080, 1920],
    ])
    // Rotation comes from the file metadata (Mediabunny's default), never applied a second time.
    const opts = sinkOptions[0] as { rotation?: number } | undefined
    expect(opts?.rotation === undefined || opts.rotation === 90).toBe(true)
  })

  it('pickReader picks the seek reader when WebCodecs cannot decode', async () => {
    expect((await pickReader(file, info({ canDecode: false }))).kind).toBe('seek')
    expect((await pickReader(file, info({ canDecode: true }))).kind).toBe('webcodecs')
  })
})

/** A <video> that loads at once and, like WebKit, fires `seeked` only when the position actually
 * changes; with `stuck`, it never fires `seeked` at all. */
function fakeSeekVideo(stuck = false) {
  const listeners = new Map<string, Set<() => void>>()
  const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn())
  let time = 0
  const v = {
    muted: false,
    playsInline: false,
    preload: '',
    readyState: 0,
    style: {},
    seeks: 0,
    get src() {
      return ''
    },
    set src(_u: string) {
      queueMicrotask(() => {
        v.readyState = 2
        fire('loadeddata')
      })
    },
    get currentTime() {
      return time
    },
    set currentTime(t: number) {
      v.seeks++
      const moved = t !== time
      time = t
      if (moved && !stuck) queueMicrotask(() => fire('seeked'))
    },
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn)
    },
    removeAttribute() {},
    load() {},
    remove() {},
  }
  return v
}

describe('seekReader', () => {
  function stubDom(video: ReturnType<typeof fakeSeekVideo>) {
    vi.stubGlobal('document', { createElement: () => video, body: { appendChild() {} } })
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:x', revokeObjectURL() {} })
    vi.stubGlobal('createImageBitmap', async () => ({ width: 1080, height: 1920, close() {} }))
  }

  it('does not wait for seeked when the time does not move', async () => {
    const video = fakeSeekVideo()
    stubDom(video)
    const times: number[] = []
    for await (const f of seekReader(file).frames([0, 0, 0.5, 0.5, 1], new AbortController().signal)) {
      times.push(f.time)
      f.close()
    }
    expect(times).toEqual([0, 0, 0.5, 0.5, 1])
    expect(video.seeks).toBe(2)
  })

  it('fails with the read message when a seek never completes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      stubDom(fakeSeekVideo(true))
      const it = seekReader(file).frames([0.5], new AbortController().signal)[Symbol.asyncIterator]()
      const next = it.next()
      const result = expect(next).rejects.toThrow("Couldn't read that video.")
      await vi.advanceTimersByTimeAsync(SEEK_TIMEOUT_MS + 1)
      await result
    } finally {
      vi.useRealTimers()
    }
  })
})
