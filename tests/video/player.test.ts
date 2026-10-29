import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlayer } from '../../src/video/player'

type Listener = () => void

/** Just enough of an HTMLVideoElement for the player: state fields, listeners and frame callbacks
 * the test fires by hand. */
function fakeVideo() {
  const listeners = new Map<string, Set<Listener>>()
  const frameCallbacks: ((now: number, meta: { mediaTime: number }) => void)[] = []
  const v = {
    src: '',
    muted: false,
    loop: false,
    playsInline: false,
    preload: '',
    paused: true,
    currentTime: 0,
    duration: 10,
    style: {} as Record<string, string>,
    setAttribute: vi.fn(),
    removeAttribute: vi.fn(),
    load: vi.fn(),
    remove: vi.fn(),
    play: vi.fn(async () => {
      v.paused = false
    }),
    pause: vi.fn(() => {
      v.paused = true
    }),
    addEventListener(type: string, fn: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set())
      listeners.get(type)!.add(fn)
    },
    removeEventListener(type: string, fn: Listener) {
      listeners.get(type)?.delete(fn)
    },
    requestVideoFrameCallback(fn: (now: number, meta: { mediaTime: number }) => void) {
      frameCallbacks.push(fn)
      return frameCallbacks.length
    },
    cancelVideoFrameCallback: vi.fn(),
  }
  const fire = (type: string) => listeners.get(type)?.forEach((fn) => fn())
  /** Calls every frame callback ever registered, as a browser racing with dispose might. */
  const frame = () => [...frameCallbacks].forEach((fn) => fn(0, { mediaTime: v.currentTime }))
  return { v, fire, frame }
}

const bitmap = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap
/** Lets the createImageBitmap promise settle. */
const flush = () => new Promise((r) => setTimeout(r, 0))

describe('createPlayer', () => {
  let fake: ReturnType<typeof fakeVideo>
  let revoke: ReturnType<typeof vi.fn<(url: string) => void>>

  beforeEach(() => {
    fake = fakeVideo()
    revoke = vi.fn<(url: string) => void>()
    vi.stubGlobal('document', { createElement: () => fake.v, body: { appendChild: vi.fn() } })
    vi.stubGlobal('createImageBitmap', vi.fn(async () => bitmap))
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:clip')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(revoke)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('skips frames while the converter is busy', async () => {
    const onFrame = vi.fn()
    createPlayer(new Blob(), { onFrame, canTakeFrame: () => false, fps: 30 })
    fake.v.paused = false
    fake.frame()
    await flush()
    expect(createImageBitmap).not.toHaveBeenCalled()
    expect(onFrame).not.toHaveBeenCalled()
  })

  it('step pauses and moves one frame', () => {
    const p = createPlayer(new Blob(), { onFrame: () => {}, canTakeFrame: () => true, fps: 25 })
    fake.v.paused = false
    fake.v.currentTime = 1
    p.step(1)
    expect(fake.v.currentTime).toBeCloseTo(1.04)
    expect(p.playing).toBe(false)
  })

  it('disposed player never calls onFrame again', async () => {
    const onFrame = vi.fn()
    const p = createPlayer(new Blob(), { onFrame, canTakeFrame: () => true, fps: 30 })
    fake.v.paused = false // a playing clip, so the frame callback would grab if not disposed
    p.dispose()
    fake.frame()
    fake.fire('seeked')
    await flush()
    expect(onFrame).not.toHaveBeenCalled()
    expect(revoke).toHaveBeenCalledWith('blob:clip')
  })

  // The real race: a grab started before dispose resolves after it. Its bitmap must be freed,
  // not handed to a converter that is gone.
  it('closes a bitmap that arrives after dispose instead of delivering it', async () => {
    const late = { width: 1, height: 1, close: vi.fn() } as unknown as ImageBitmap
    let resolveBitmap!: (b: ImageBitmap) => void
    vi.stubGlobal('createImageBitmap', vi.fn(() => new Promise<ImageBitmap>((r) => (resolveBitmap = r))))
    const onFrame = vi.fn()
    const p = createPlayer(new Blob(), { onFrame, canTakeFrame: () => true, fps: 30 })
    fake.fire('seeked')
    expect(createImageBitmap).toHaveBeenCalledTimes(1)
    p.dispose()
    resolveBitmap(late)
    await flush()
    expect(onFrame).not.toHaveBeenCalled()
    expect(late.close).toHaveBeenCalled()
  })
})
