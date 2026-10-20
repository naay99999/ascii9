import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createConverter, type FromWorker, type ToWorker, type WorkerLike } from '../../src/lib/converter'
import { DEFAULT_SETTINGS } from '../../src/engine/defaults'
import type { Grid } from '../../src/engine/types'
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
  return { w, posted, reply }
}

const grid = (n: number): Grid => ({ cols: n, rows: 1, glyphs: [' '], index: new Uint16Array(n), rgb: new Uint8Array(n * 3) })
const plan: GridPlan = { cols: 1, rows: 1, crop: { sx: 0, sy: 0, sw: 1, sh: 1 } }
const bitmap = { width: 1, height: 1 } as unknown as ImageBitmap

describe('createConverter', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces requests and sends the last settings', () => {
    const { w, posted } = fakeWorker()
    const c = createConverter(w, () => {})
    const s = (detail: number) => ({ ...DEFAULT_SETTINGS, layout: { ...DEFAULT_SETTINGS.layout, detail } })
    c.request(s(10), 0.6)
    c.request(s(20), 0.6)
    c.request(s(30), 0.6)
    vi.advanceTimersByTime(59)
    expect(posted).toHaveLength(0)
    vi.advanceTimersByTime(1)
    expect(posted).toHaveLength(1)
    const m = posted[0].m
    expect(m.type).toBe('convert')
    if (m.type === 'convert') expect(m.settings.layout.detail).toBe(30)
  })

  it('drops replies older than the last delivered id', () => {
    const { w, reply } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(60)
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(60)
    reply({ type: 'grid', id: 2, grid: grid(2), plan })
    reply({ type: 'grid', id: 1, grid: grid(1), plan })
    expect(onGrid).toHaveBeenCalledTimes(1)
    expect(onGrid.mock.calls[0][0].cols).toBe(2)
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

  it('ignores an error reply for a convert without throwing', () => {
    const { w, reply } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(60)
    expect(() => reply({ type: 'error', id: 1, message: 'no image' })).not.toThrow()
    expect(onGrid).not.toHaveBeenCalled()
  })

  it('dispose cancels a pending request and detaches onmessage', () => {
    const { w, posted } = fakeWorker()
    const c = createConverter(w, () => {})
    c.request(DEFAULT_SETTINGS, 0.6)
    c.dispose()
    vi.advanceTimersByTime(200)
    expect(posted).toHaveLength(0)
    expect(w.onmessage).toBeNull()
  })

  it('setImage posts the bitmap immediately with transfer; request afterwards still posts convert', () => {
    const { w, posted } = fakeWorker()
    const c = createConverter(w, () => {})
    c.setImage(bitmap)
    expect(posted).toHaveLength(1)
    expect(posted[0].m.type).toBe('image')
    expect(posted[0].transfer).toEqual([bitmap])
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(60)
    expect(posted[1].m.type).toBe('convert')
  })
  it('passes the settings and cellAspect of the request whose reply is delivered, not the latest', () => {
    const { w, reply } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    const s = (frame: '1:1' | '9:16') => ({ ...DEFAULT_SETTINGS, layout: { ...DEFAULT_SETTINGS.layout, frame } })
    c.request(s('1:1'), 0.6)
    vi.advanceTimersByTime(60) // id 1 sent
    c.request(s('9:16'), 0.55)
    vi.advanceTimersByTime(60) // id 2 sent, not answered yet
    reply({ type: 'grid', id: 1, grid: grid(1), plan })
    expect(onGrid).toHaveBeenCalledTimes(1)
    const used = onGrid.mock.calls[0][2]
    expect(used.settings.layout.frame).toBe('1:1')
    expect(used.cellAspect).toBe(0.6)
    reply({ type: 'grid', id: 2, grid: grid(2), plan })
    expect(onGrid.mock.calls[1][2].settings.layout.frame).toBe('9:16')
    expect(onGrid.mock.calls[1][2].cellAspect).toBe(0.55)
  })

  it('records a copy: mutating the settings after request does not change used', () => {
    const { w, reply } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    const s = structuredClone(DEFAULT_SETTINGS)
    c.request(s, 0.6)
    vi.advanceTimersByTime(60)
    s.layout.detail = 199
    reply({ type: 'grid', id: 1, grid: grid(1), plan })
    expect(onGrid.mock.calls[0][2].settings.layout.detail).toBe(DEFAULT_SETTINGS.layout.detail)
  })

  it('still drops stale replies after a newer one was delivered, with used intact', () => {
    const { w, reply } = fakeWorker()
    const onGrid = vi.fn()
    const c = createConverter(w, onGrid)
    c.request(DEFAULT_SETTINGS, 0.6)
    vi.advanceTimersByTime(60)
    c.request({ ...DEFAULT_SETTINGS, layout: { ...DEFAULT_SETTINGS.layout, frame: '4:5' } }, 0.6)
    vi.advanceTimersByTime(60)
    reply({ type: 'grid', id: 2, grid: grid(2), plan })
    reply({ type: 'grid', id: 1, grid: grid(1), plan })
    expect(onGrid).toHaveBeenCalledTimes(1)
    expect(onGrid.mock.calls[0][2].settings.layout.frame).toBe('4:5')
  })
})
