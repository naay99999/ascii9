import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { VideoInfo } from '../../src/video/probe'
import type { Player, PlayerOptions } from '../../src/video/player'

const probeVideo = vi.fn<(f: Blob) => Promise<VideoInfo>>()
let autoReady = true
const made: { player: Player; opts: PlayerOptions; fail: (e: Error) => void }[] = []

vi.mock('../../src/video/probe', () => ({ probeVideo: (f: Blob) => probeVideo(f) }))
vi.mock('../../src/video/player', () => ({
  createPlayer: (_f: Blob, opts: PlayerOptions) => {
    let fail!: (e: Error) => void
    let ok!: () => void
    const ready = new Promise<void>((res, rej) => {
      ok = res
      fail = rej
    })
    ready.catch(() => {})
    const player = { ready, dispose: vi.fn() } as unknown as Player
    made.push({ player, opts, fail })
    if (autoReady) queueMicrotask(ok)
    return player
  },
}))

const { openVideo, frameAccepter } = await import('../../src/video/open')

const info = (duration: number): VideoInfo => ({
  duration,
  width: 1080,
  height: 1920,
  fps: 30,
  rotation: 0,
  videoCodec: 'avc',
  canDecode: true,
  audio: null,
})
const file = new File([], 'clip.mp4', { type: 'video/mp4' })
const bitmap = () => ({ close: vi.fn() }) as unknown as ImageBitmap

function opts(over: Partial<Parameters<typeof openVideo>[1]> = {}) {
  return {
    mobile: false,
    stale: () => false,
    accept: () => true,
    onFrame: vi.fn(),
    canTakeFrame: () => true,
    ...over,
  }
}

beforeEach(() => {
  probeVideo.mockReset()
  made.length = 0
  autoReady = true
})

describe('openVideo', () => {
  it('maps a probe failure to the video read message', async () => {
    probeVideo.mockRejectedValue(new Error('Unsupported or unrecognizable format'))
    await expect(openVideo(file, opts())).rejects.toThrow("Couldn't read that video.")
  })

  it('rejects an over-long clip without touching the current clip', async () => {
    probeVideo.mockResolvedValue(info(61))
    const beforePlayer = vi.fn()
    await expect(openVideo(file, opts({ beforePlayer }))).rejects.toThrow('That video is longer than 60 seconds.')
    expect(beforePlayer).not.toHaveBeenCalled()
    expect(made).toHaveLength(0)
  })

  it('maps a player that cannot play to the video read message and disposes it', async () => {
    probeVideo.mockResolvedValue(info(5))
    autoReady = false
    const p = openVideo(file, opts())
    await vi.waitFor(() => expect(made).toHaveLength(1))
    made[0].fail(new Error('MEDIA_ERR_SRC_NOT_SUPPORTED'))
    await expect(p).rejects.toThrow("Couldn't read that video.")
    expect(made[0].player.dispose).toHaveBeenCalled()
  })

  it('forwards a frame only while accept() says its player may draw', async () => {
    probeVideo.mockResolvedValue(info(5))
    let allow = true
    const accept = vi.fn(() => allow)
    const o = opts({ accept })
    const result = await openVideo(file, o)
    const { opts: playerOpts, player } = made[0]
    expect(result?.player).toBe(player)
    expect(playerOpts.fps).toBe(30)

    const a = bitmap()
    playerOpts.onFrame(a, 0)
    expect(o.onFrame).toHaveBeenCalledWith(a, 0)
    expect(accept).toHaveBeenLastCalledWith(player)

    allow = false
    const b = bitmap()
    playerOpts.onFrame(b, 0.1)
    expect(o.onFrame).toHaveBeenCalledTimes(1)
    expect(b.close).toHaveBeenCalled()
  })

  it('disposes the player it made when a newer load overtook it', async () => {
    probeVideo.mockResolvedValue(info(5))
    let stale = false
    const p = openVideo(file, opts({ stale: () => stale, beforePlayer: () => (stale = true) }))
    await expect(p).resolves.toBeNull()
    expect(made[0].player.dispose).toHaveBeenCalled()
  })
})

describe('frameAccepter', () => {
  const oldP = { id: 'old' } as unknown as Player
  const newP = { id: 'new' } as unknown as Player

  it('keeps the current clip drawing while a newer load is still probing or fails', () => {
    let current: Player | null = oldP
    let latest = 1
    const oldLoad = frameAccepter(() => current, () => latest === 1)
    latest = 2 // a new file was dropped
    expect(oldLoad(oldP)).toBe(true) // old art keeps moving during the probe, and after a rejection
    current = null // the new clip passed its checks: beforePlayer closed the old one
    expect(oldLoad(oldP)).toBe(false)
  })

  it("lets the latest load's player draw before it becomes current, and never after it is overtaken", () => {
    let current: Player | null = oldP
    let latest = 2
    const newLoad = frameAccepter(() => current, () => latest === 2)
    expect(newLoad(newP)).toBe(true)
    current = newP
    expect(newLoad(newP)).toBe(true)
    current = null // a photo replaced it
    latest = 3
    expect(newLoad(newP)).toBe(false)
  })
})
