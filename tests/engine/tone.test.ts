import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/engine/defaults'
import { adjustRGB, luminance } from '../../src/engine/tone'

const base = { ...DEFAULT_SETTINGS.look, contrast: 0, gamma: 1 }
const run = (r: number, g: number, b: number, o = {}) => {
  const out = new Uint8Array(3)
  adjustRGB(r, g, b, { ...base, ...o }, out)
  return Array.from(out)
}

describe('adjustRGB', () => {
  it('is identity with neutral settings', () => {
    expect(run(100, 150, 200)).toEqual([100, 150, 200])
  })
  it('brightness 100 lifts black to white', () => {
    expect(run(0, 0, 0, { brightness: 100 })).toEqual([255, 255, 255])
  })
  it('contrast 100 stretches 192 to 255 and 63 to 0', () => {
    expect(run(192, 63, 128, { contrast: 100 }).slice(0, 2)).toEqual([255, 0])
  })
  it('gamma 2 maps 128 to about 64', () => {
    expect(Math.abs(run(128, 128, 128, { gamma: 2 })[0] - 64)).toBeLessThanOrEqual(1)
  })
  it('saturation 0 greys out in image mode', () => {
    const o = run(255, 0, 0, { colorMode: 'image', saturation: 0 })
    o.forEach((v) => expect(Math.abs(v - 76)).toBeLessThanOrEqual(1))
  })
  it('saturation is ignored in mono mode', () => {
    expect(run(255, 0, 0, { colorMode: 'mono', saturation: 0 })).toEqual([255, 0, 0])
  })
  it('applies gamma before brightness (order)', () => {
    // gamma 2: 128->64.25, then -51 -> 13; brightness-first would give ~23
    expect(run(128, 128, 128, { gamma: 2, brightness: -20 })[0]).toBe(13)
  })
})

describe('luminance', () => {
  it('uses Rec. 601 weights', () => {
    expect(luminance(255, 0, 0)).toBeCloseTo(76.245)
    expect(luminance(255, 255, 255)).toBeCloseTo(255)
  })
})
