import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/engine/defaults'
import type { VideoInfo } from '../../src/video/probe'
import type { FrameReader, ReaderFrame } from '../../src/video/readers'
import { exportGif } from '../../src/video/exportGif'

class FakeCtx {
  fillStyle = ''
  font = ''
  textBaseline = ''
  globalAlpha = 1
  imageSmoothingQuality = 'low'
  constructor(public canvas: { width: number; height: number }) {}
  setTransform() {}
  translate() {}
  scale() {}
  fillRect() {}
  clearRect() {}
  drawImage() {}
  fillText() {}
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
})
afterEach(() => {
  vi.unstubAllGlobals()
})

const info: VideoInfo = { width: 640, height: 360, duration: 1, fps: 30, audio: false, canDecode: true } as unknown as VideoInfo

function fakeReader(asked: number[][]): FrameReader {
  return {
    kind: 'webcodecs',
    async *frames(times, signal) {
      asked.push(times)
      for (const time of times) {
        if (signal.aborted) return
        const frame: ReaderFrame = { time, image: {} as CanvasImageSource, width: 640, height: 360, close() {} }
        yield frame
      }
    },
  }
}

const job = { file: new Blob(), info, settings: DEFAULT_SETTINGS, cellAspect: 0.5 }

describe('exportGif', () => {
  it('writes a GIF89a with one frame per output time', async () => {
    const asked: number[][] = []
    const progress: number[] = []
    const blob = await exportGif(job, {
      reader: fakeReader(asked),
      onProgress: (p) => progress.push(p),
      signal: new AbortController().signal,
    })
    expect(blob.type).toBe('image/gif')
    const bytes = new Uint8Array(await blob.arrayBuffer())
    expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a')
    expect(asked).toHaveLength(1)
    expect(asked[0]).toHaveLength(15)
    expect(progress.at(-1)).toBe(1)
  })

  it('cancels on abort', async () => {
    const ctl = new AbortController()
    const p = exportGif(job, { reader: fakeReader([]), onProgress: () => ctl.abort(), signal: ctl.signal })
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    await expect(
      exportGif(job, { reader: fakeReader([]), onProgress() {}, signal: ctl.signal }),
    ).rejects.toMatchObject({ name: 'AbortError' })
  })
})
