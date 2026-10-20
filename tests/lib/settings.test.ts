import { describe, it, expect, vi, afterEach } from 'vitest'
import { loadSettings, saveSettings, resetSettings, settings } from '../../src/lib/settings.svelte'
import { createDebouncedSaver } from '../../src/lib/settingsStorage'
import { DEFAULT_SETTINGS } from '../../src/engine/defaults'

const store = (v: string) => ({ getItem: () => v })

describe('loadSettings', () => {
  it('returns defaults for null storage', () => {
    expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS)
  })
  it('returns defaults for garbage JSON', () => {
    expect(loadSettings(store('{'))).toEqual(DEFAULT_SETTINGS)
  })
  it('returns defaults when getItem throws', () => {
    expect(loadSettings({ getItem: () => { throw new Error('x') } })).toEqual(DEFAULT_SETTINGS)
  })
  it('merges valid fields and falls back on bad enums', () => {
    const s = loadSettings(store('{"look":{"contrast":40,"style":"emoji"},"layout":{"frame":"9:16"}}'))
    expect(s.look.contrast).toBe(40)
    expect(s.layout.frame).toBe('9:16')
    expect(s.look.style).toBe('ascii')
  })
  it('clamps numbers', () => {
    expect(loadSettings(store('{"layout":{"detail":999}}')).layout.detail).toBe(200)
    expect(loadSettings(store('{"layout":{"detail":3}}')).layout.detail).toBe(20)
    const l = loadSettings(store('{"look":{"gamma":9,"saturation":-5,"brightness":-500,"edgeIntensity":500}}')).look
    expect([l.gamma, l.saturation, l.brightness, l.edgeIntensity]).toEqual([2.5, 0, -100, 100])
  })
  it('falls back for bad colours and wrong types', () => {
    const l = loadSettings(store('{"look":{"monoColor":"red","duo1":"#ABCDEF","contrast":"hi","invert":1}}')).look
    expect(l.monoColor).toBe(DEFAULT_SETTINGS.look.monoColor)
    expect(l.duo1).toBe('#ABCDEF')
    expect(l.contrast).toBe(DEFAULT_SETTINGS.look.contrast)
    expect(l.invert).toBe(false)
  })
  it('returns defaults for non-object JSON', () => {
    for (const j of ['null', '42', '[]', '"x"']) expect(loadSettings(store(j))).toEqual(DEFAULT_SETTINGS)
  })
  it('returns an independent copy of defaults', () => {
    const s = loadSettings(null)
    s.layout.detail = 33
    s.look.contrast = 1
    expect(DEFAULT_SETTINGS.layout.detail).toBe(80)
    expect(DEFAULT_SETTINGS.look.contrast).toBe(15)
  })
})

describe('saveSettings', () => {
  it('swallows errors and tolerates null', () => {
    expect(() => saveSettings({ setItem: () => { throw new Error('quota') } }, DEFAULT_SETTINGS)).not.toThrow()
    expect(() => saveSettings(null, DEFAULT_SETTINGS)).not.toThrow()
  })
  it('writes under the versioned key', () => {
    const calls: [string, string][] = []
    saveSettings({ setItem: (k, v) => void calls.push([k, v]) }, DEFAULT_SETTINGS)
    expect(calls[0][0]).toBe('ascii9:settings:v1')
    expect(JSON.parse(calls[0][1])).toEqual(DEFAULT_SETTINGS)
  })
})

describe('resetSettings', () => {
  it('restores everything incl. frame without mutating DEFAULT_SETTINGS', () => {
    const snap = structuredClone(DEFAULT_SETTINGS)
    settings.value.layout.frame = '1:1'
    settings.value.look.contrast = 99
    resetSettings()
    expect(settings.value).toEqual(snap)
    settings.value.layout.frame = '4:5'
    expect(DEFAULT_SETTINGS).toEqual(snap)
    resetSettings()
  })
})

describe('createDebouncedSaver', () => {
  afterEach(() => vi.useRealTimers())
  const mk = (n: number) => ({ ...structuredClone(DEFAULT_SETTINGS), layout: { ...DEFAULT_SETTINGS.layout, detail: n } })
  it('saves once with the last value after the delay', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const d = createDebouncedSaver(save, 300)
    d.schedule(mk(30))
    vi.advanceTimersByTime(200)
    d.schedule(mk(40))
    vi.advanceTimersByTime(299)
    expect(save).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0].layout.detail).toBe(40)
  })
  it('flush saves immediately, once', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const d = createDebouncedSaver(save)
    d.schedule(mk(50))
    d.flush()
    expect(save).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(1000)
    expect(save).toHaveBeenCalledTimes(1)
    d.flush()
    expect(save).toHaveBeenCalledTimes(1)
  })
  it('cancel prevents the save', () => {
    vi.useFakeTimers()
    const save = vi.fn()
    const d = createDebouncedSaver(save)
    d.schedule(mk(60))
    d.cancel()
    vi.advanceTimersByTime(1000)
    d.flush()
    expect(save).not.toHaveBeenCalled()
  })
})
