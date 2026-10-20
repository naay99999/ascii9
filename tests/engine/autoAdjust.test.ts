import { describe, expect, it } from 'vitest'
import { autoAdjust } from '../../src/engine/autoAdjust'

const fill = (w: number, h: number, f: (i: number) => number) => {
  const a = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < w * h; i++) a.set([f(i), f(i), f(i), 255], i * 4)
  return a
}

describe('autoAdjust', () => {
  it('uniform mid-grey gives neutral brightness and gamma, max contrast', () => {
    expect(autoAdjust(fill(10, 10, () => 128), 10, 10)).toEqual({ brightness: 0, contrast: 60, gamma: 1 })
  })
  it('a dark image is brightened with gamma below 1', () => {
    const r = autoAdjust(fill(10, 10, (i) => 30 + (i % 31)), 10, 10)
    expect(r.brightness).toBeGreaterThan(0)
    expect(r.gamma).toBeLessThan(1)
  })
  it('a bright image gets gamma above 1 and negative brightness', () => {
    const r = autoAdjust(fill(10, 10, (i) => 200 + (i % 51)), 10, 10)
    expect(r.brightness).toBeLessThan(0)
    expect(r.gamma).toBeGreaterThan(1)
  })
  it('ignores the extreme 1% outliers', () => {
    const r = autoAdjust(fill(10, 20, (i) => (i === 0 ? 0 : i === 1 ? 255 : 100 + (i % 20))), 10, 20)
    expect(r.contrast).toBeGreaterThan(10)
  })
  it.each([
    ['black', 0],
    ['near-black', 3],
    ['white', 255],
    ['near-white', 252],
  ])('a %s image keeps gamma in 0.5-2.0 (rounded to 0.1) and brightness in +-50', (_name, v) => {
    const r = autoAdjust(fill(20, 10, () => v), 20, 10)
    expect(r.gamma).toBeGreaterThanOrEqual(0.5)
    expect(r.gamma).toBeLessThanOrEqual(2)
    expect(Math.round(r.gamma * 10) / 10).toBe(r.gamma)
    expect(Math.abs(r.brightness)).toBeLessThanOrEqual(50)
    expect(r.contrast).toBeGreaterThanOrEqual(-30)
    expect(r.contrast).toBeLessThanOrEqual(60)
  })
  it('the extremes reach the brightness clamp exactly', () => {
    expect(autoAdjust(fill(10, 10, () => 0), 10, 10).brightness).toBe(50)
    expect(autoAdjust(fill(10, 10, () => 255), 10, 10).brightness).toBe(-50)
  })
  it('an empty input (zero pixels) returns neutral, finite values', () => {
    const r = autoAdjust(new Uint8ClampedArray(0), 0, 0)
    expect(r).toEqual({ brightness: 0, contrast: -7, gamma: 1 })
  })
})
