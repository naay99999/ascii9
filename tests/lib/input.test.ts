import { describe, it, expect, vi, afterEach } from 'vitest'
import { validateFile, loadBitmap, imageFromClipboard, imageFromDrop } from '../../src/lib/input'

afterEach(() => vi.unstubAllGlobals())
const MB10 = 10 * 1024 * 1024

describe('validateFile', () => {
  it('rejects non-images', () => {
    expect(validateFile({ type: 'text/plain', size: 1 })).toEqual({ ok: false, message: "That file isn't an image." })
  })
  it('rejects over 10 MB, allows exactly 10 MB', () => {
    expect(validateFile({ type: 'image/png', size: MB10 + 1 })).toEqual({ ok: false, message: 'That image is over 10 MB.' })
    expect(validateFile({ type: 'image/png', size: MB10 })).toEqual({ ok: true })
  })
})

describe('loadBitmap', () => {
  it('rejects with friendly message on decode failure', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn().mockRejectedValue(new Error('bad')))
    await expect(loadBitmap(new Blob(['x']))).rejects.toThrow("Couldn't read that image.")
  })
  it('rejects on 0x0 bitmap', async () => {
    const close = vi.fn()
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue({ width: 0, height: 0, close }))
    await expect(loadBitmap(new Blob(['x']))).rejects.toThrow("Couldn't read that image.")
  })
  it('rejects when the re-decode is empty', async () => {
    const close = vi.fn()
    const empty = { width: 0, height: 0, close: vi.fn() }
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValueOnce({ width: 9000, height: 3000, close }).mockResolvedValueOnce(empty))
    await expect(loadBitmap(new Blob(['x']))).rejects.toThrow("Couldn't read that image.")
    expect(empty.close).toHaveBeenCalled()
  })
  it('caps long edge by re-decoding', async () => {
    const close = vi.fn()
    const small = { width: 4096, height: 1365 }
    const fn = vi.fn().mockResolvedValueOnce({ width: 9000, height: 3000, close }).mockResolvedValueOnce(small)
    vi.stubGlobal('createImageBitmap', fn)
    const b = await loadBitmap(new Blob(['x']))
    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn.mock.calls[1][1]).toMatchObject({ resizeWidth: 4096, resizeHeight: 1365 })
    expect(close).toHaveBeenCalled()
    expect(b).toBe(small)
  })
  it('does not re-decode when within limit', async () => {
    const bm = { width: 100, height: 50, close: vi.fn() }
    const fn = vi.fn().mockResolvedValue(bm)
    vi.stubGlobal('createImageBitmap', fn)
    expect(await loadBitmap(new Blob(['x']))).toBe(bm)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('imageFromClipboard', () => {
  it('returns null for text only', () => {
    expect(imageFromClipboard([{ kind: 'string', type: 'text/plain', getAsFile: () => null }])).toBeNull()
  })
  it('returns the image file', () => {
    const f = { type: 'image/png' } as File
    expect(imageFromClipboard([{ kind: 'file', type: 'image/png', getAsFile: () => f }])).toBe(f)
  })
  it('does not throw on odd input', () => {
    expect(imageFromClipboard(null as never)).toBeNull()
    expect(imageFromClipboard([{ kind: 'file', type: 'image/png', getAsFile: () => { throw new Error('x') } }])).toBeNull()
  })
})

describe('imageFromDrop', () => {
  it('returns first image file', () => {
    const t = { type: 'text/plain' } as File, i = { type: 'image/jpeg' } as File
    expect(imageFromDrop({ files: [t, i] })).toBe(i)
  })
  it('returns null for a non-image', () => {
    expect(imageFromDrop({ files: [{ type: 'application/pdf' } as File] })).toBeNull()
  })
})
