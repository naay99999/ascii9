import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConverter, type FromWorker, type ToWorker, type WorkerLike } from '../../src/lib/converter'
import { DEFAULT_SETTINGS } from '../../src/engine/defaults'
import type { Grid, Settings } from '../../src/engine/types'
import type { GridPlan } from '../../src/engine/layout'

function fakeWorker() {
  const posted: { m: ToWorker; transfer?: Transferable[] }[] = []
  const w: WorkerLike = {
    postMessage(m, transfer) {
      posted.push({ m, transfer })
    },
    onmessage: null,
  }
  const reply = (data: FromWorker) => w.onmessage?.({ data })
  const converts = () => posted.map((p) => p.m).filter((m): m is Extract<ToWorker, { type: 'convert' }> => m.type === 'convert')
  return { w, posted, reply, converts }
}

const grid = (n: number): Grid => ({ cols: n, rows: 1, glyphs: [' '], index: new Uint16Array(n), rgb: new Uint8Array(n * 3) })
const plan: GridPlan = { cols: 1, rows: 1, crop: { sx: 0, sy: 0, sw: 1, sh: 1 } }
const bitmap = { width: 1, height: 1 } as unknown as ImageBitmap
const withDetail = (detail: number): Settings => ({ ...DEFAULT_SETTINGS, layout: { ...DEFAULT_SETTINGS.layout, detail } })
const withFrame = (frame: '1:1' | '4:5' | '9:16'): Settings => ({ ...DEFAULT_SETTINGS, layout: { ...DEFAULT_SETTINGS.layout, frame } })

describe('createConverter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('posts the first request at once, coalescing a synchronous burst into one post with the last settings', () => {
    const { w, converts } = fakeWorker()
    const c = createConverter(w, () => {})
    c.request(withDetail(10), 0.6)
    c.request(withDetail(20), 0.6)
    c.request(withDetail(30), 0.6)
    vi.advanceTimersByTime(0)
    expect(converts()).toHaveLength(1)
    expect(converts()[0].settings.layout.detail).toBe(30)
  })

  it('during a drag, posts exactly one follow-up carrying the latest settings when the in-flight reply arrives', () => {
    const { w, reply, converts } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    c.request(withDetail(10), 0.6)
    vi.advanceTimersByTime(0)
    expect(converts()).toHaveLength(1)
    // a steady drag: an input event every 10 ms while the first job is still running
    for (let d = 11; d <= 60; d++) {
      c.request(withDetail(d), 0.6)
      vi.advanceTimersByTime(10)
    }
    expect(converts()).toHaveLength(1)
    reply({ type: 'grid', id: converts()[0].id, grid: grid(1), plan })
    expect(onGrid).toHaveBeenCalledTimes(1)
    expect(converts()).toHaveLength(2)
    expect(converts()[1].settings.layout.detail).toBe(60)
    reply({ type: 'grid', id: converts()[1].id, grid: grid(2), plan })
    vi.advanceTimersByTime(100)
    expect(converts()).toHaveLength(2) // nothing newer was asked for
    expect(onGrid.mock.calls[1][2].settings.layout.detail).toBe(60)
  })

  it('an error reply also releases the in-flight slot', () => {
    const { w, reply, converts } = fakeWorker()
    const c = createConverter(w, () => {})
    c.request(withDetail(10), 0.6)
    vi.advanceTimersByTime(0)
    c.request(withDetail(20), 0.6)
    vi.advanceTimersByTime(50)
    expect(converts()).toHaveLength(1)
    reply({ type: 'error', id: converts()[0].id, message: 'too big' })
    expect(converts()).toHaveLength(2)
    expect(converts()[1].settings.layout.detail).toBe(20)
  })

  it('a request after an idle reply posts straight away again', () => {
    const { w, reply, converts } = fakeWorker()
    const c = createConverter(w, () => {})
    c.request(withDetail(10), 0.6)
    vi.advanceTimersByTime(0)
    reply({ type: 'grid', id: converts()[0].id, grid: grid(1), plan })
    c.request(withDetail(20), 0.6)
    vi.advanceTimersByTime(0)
    expect(converts()).toHaveLength(2)
  })

  it('calls onError for the error reply of a convert, with what it was asked with', () => {
    const { w, reply, converts } = fakeWorker()
    const onGrid = vi.fn()
    const onError = vi.fn()
    const c = createConverter(w, onGrid, { onError })
    c.setImage(bitmap)
    c.request(withDetail(42), 0.6)
    vi.advanceTimersByTime(0)
    expect(() => reply({ type: 'error', id: converts()[0].id, message: 'no image' })).not.toThrow()
    expect(onGrid).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError.mock.calls[0][0]).toBe('no image')
    expect(onError.mock.calls[0][1].settings.layout.detail).toBe(42)
    expect(onError.mock.calls[0][1].image).toBe(1)
  })

  it('does not call onError for stale or unknown ids, nor for auto errors', async () => {
    const { w, reply, converts, posted } = fakeWorker()
    const onError = vi.fn()
    const c = createConverter(w, () => {}, { onError })
    c.request(withDetail(10), 0.6)
    vi.advanceTimersByTime(0)
    const first = converts()[0].id
    reply({ type: 'grid', id: first, grid: grid(1), plan })
    reply({ type: 'error', id: first, message: 'late duplicate' }) // already delivered: stale
    reply({ type: 'error', id: 999, message: 'unknown' })
    const p = c.autoAdjust()
    const autoId = (posted[posted.length - 1].m as { id: number }).id
    reply({ type: 'error', id: autoId, message: 'auto failed' })
    await expect(p).rejects.toThrow('auto failed')
    expect(onError).not.toHaveBeenCalled()
  })

  it('works without an onError callback', () => {
    const { w, reply, converts } = fakeWorker()
    const c = createConverter(w, () => {})
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(0)
    expect(() => reply({ type: 'error', id: converts()[0].id, message: 'x' })).not.toThrow()
  })

  it('tags each request with the image it was made for', () => {
    const { w, reply, converts } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    expect(c.setImage(bitmap)).toBe(1)
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(0)
    reply({ type: 'grid', id: converts()[0].id, grid: grid(1), plan })
    expect(c.setImage(bitmap)).toBe(2)
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(0)
    reply({ type: 'grid', id: converts()[1].id, grid: grid(1), plan })
    expect(onGrid.mock.calls.map((x) => x[2].image)).toEqual([1, 2])
  })

  it('drops replies older than the last delivered id', () => {
    const { w, reply } = fakeWorker()
    const onGrid = vi.fn()
    createConverter(w, onGrid)
    // ids are not in flight here: a reply out of order is still dropped
    reply({ type: 'grid', id: 2, grid: grid(2), plan })
    reply({ type: 'grid', id: 1, grid: grid(1), plan })
    expect(onGrid).not.toHaveBeenCalled() // neither id was ever sent
  })

  it('resolves autoAdjust from the matching auto reply and rejects on error', async () => {
    const { w, posted, reply } = fakeWorker()
    const c = createConverter(w, () => {})
    const p = c.autoAdjust()
    const m = posted[0].m
    expect(m.type).toBe('auto')
    const id = (m as { id: number }).id
    reply({ type: 'auto', id, result: { brightness: 1, contrast: 2, gamma: 3 } })
    await expect(p).resolves.toEqual({ brightness: 1, contrast: 2, gamma: 3 })
    const p2 = c.autoAdjust()
    const id2 = (posted[1].m as { id: number }).id
    reply({ type: 'error', id: id2, message: 'boom' })
    await expect(p2).rejects.toThrow('boom')
  })

  it('dispose cancels a pending request, clears the queue and detaches onmessage', () => {
    const { w, posted, converts } = fakeWorker()
    const c = createConverter(w, () => {})
    c.request(DEFAULT_SETTINGS, 0.6)
    c.dispose()
    vi.advanceTimersByTime(200)
    expect(posted).toHaveLength(0)
    expect(w.onmessage).toBeNull()
    const second = fakeWorker()
    const c2 = createConverter(second.w, () => {})
    c2.request(withDetail(10), 0.6)
    vi.advanceTimersByTime(0)
    c2.request(withDetail(20), 0.6) // queued behind the in-flight job
    const handler = second.w.onmessage
    c2.dispose()
    handler?.({ data: { type: 'grid', id: second.converts()[0].id, grid: grid(1), plan } })
    expect(second.converts()).toHaveLength(1)
    expect(converts()).toHaveLength(0)
  })

  it('setImage posts the bitmap immediately with transfer; request afterwards still posts convert', () => {
    const { w, posted } = fakeWorker()
    const c = createConverter(w, () => {})
    c.setImage(bitmap)
    expect(posted).toHaveLength(1)
    expect(posted[0].m.type).toBe('image')
    expect(posted[0].transfer).toEqual([bitmap])
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(0)
    expect(posted[1].m.type).toBe('convert')
  })

  it('passes the settings and cellAspect of the request whose reply is delivered, not the latest', () => {
    const { w, reply, converts } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    c.request(withFrame('1:1'), 0.6)
    vi.advanceTimersByTime(0) // id 1 sent
    c.request(withFrame('9:16'), 0.55) // queued
    reply({ type: 'grid', id: converts()[0].id, grid: grid(1), plan })
    expect(onGrid).toHaveBeenCalledTimes(1)
    const used = onGrid.mock.calls[0][2]
    expect(used.settings.layout.frame).toBe('1:1')
    expect(used.cellAspect).toBe(0.6)
    reply({ type: 'grid', id: converts()[1].id, grid: grid(2), plan })
    expect(onGrid.mock.calls[1][2].settings.layout.frame).toBe('9:16')
    expect(onGrid.mock.calls[1][2].cellAspect).toBe(0.55)
  })

  it('records a copy: mutating the settings after request does not change used', () => {
    const { w, reply, converts } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    const s = structuredClone(DEFAULT_SETTINGS)
    c.request(s, 0.6)
    vi.advanceTimersByTime(0)
    s.layout.detail = 199
    reply({ type: 'grid', id: converts()[0].id, grid: grid(1), plan })
    expect(onGrid.mock.calls[0][2].settings.layout.detail).toBe(DEFAULT_SETTINGS.layout.detail)
  })

  it('still drops a stale reply after a newer one was delivered, with used intact', () => {
    const { w, reply, converts } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(0)
    c.request(withFrame('4:5'), 0.6)
    reply({ type: 'grid', id: converts()[0].id, grid: grid(1), plan })
    reply({ type: 'grid', id: converts()[1].id, grid: grid(2), plan })
    reply({ type: 'grid', id: converts()[0].id, grid: grid(1), plan }) // duplicate of an older id
    expect(onGrid).toHaveBeenCalledTimes(2)
    expect(onGrid.mock.calls[1][2].settings.layout.frame).toBe('4:5')
  })
})

describe('createConverter image tagging', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  it('a request queued before setImage but posted after it is tagged with the new image', () => {
    const { w, reply, converts } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    c.setImage(bitmap)
    c.request(withDetail(10), 0.6)
    vi.advanceTimersByTime(0)
    c.request(withDetail(20), 0.6) // queued behind the in-flight job
    c.setImage(bitmap)
    reply({ type: 'grid', id: converts()[0].id, grid: grid(1), plan })
    reply({ type: 'grid', id: converts()[1].id, grid: grid(1), plan })
    expect(onGrid.mock.calls.map((x) => x[2].image)).toEqual([1, 2])
  })
})

it('imageBase continues the image numbering for a replacement converter', () => {
  const { w } = fakeWorker()
  const c = createConverter(w, () => {}, { imageBase: 7 })
  expect(c.setImage(bitmap)).toBe(8)
})
