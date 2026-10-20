import { describe, expect, it } from 'vitest'
import { blendEdges, sobel } from '../../src/engine/edges'

describe('sobel', () => {
  it('returns zeros for a uniform image including borders', () => {
    const out = sobel(new Uint8Array(25).fill(120), 5, 5)
    expect(Array.from(out).every((v) => v === 0)).toBe(true)
  })
  it('responds next to a vertical step', () => {
    const g = new Uint8Array(25)
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) g[y * 5 + x] = x < 2 ? 0 : 255
    const out = sobel(g, 5, 5)
    for (let y = 0; y < 5; y++) {
      expect(out[y * 5 + 1]).toBeGreaterThan(0)
      expect(out[y * 5 + 2]).toBeGreaterThan(0)
      expect(out[y * 5 + 0]).toBe(0)
      expect(out[y * 5 + 4]).toBe(0)
    }
  })
})

describe('blendEdges', () => {
  const mk = () => new Uint8ClampedArray([10, 20, 30, 200, 40, 50, 60, 100])
  it('k=0 leaves input unchanged', () => {
    const a = mk()
    blendEdges(a, new Uint8Array([255, 255]), 0)
    expect(Array.from(a)).toEqual(Array.from(mk()))
  })
  it('k=1 replaces rgb with edge, keeps alpha', () => {
    const a = mk()
    blendEdges(a, new Uint8Array([255, 7]), 1)
    expect(Array.from(a)).toEqual([255, 255, 255, 200, 7, 7, 7, 100])
  })
})
