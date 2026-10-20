import { describe, expect, it } from 'vitest'
import { convert } from '../../src/engine/convert'
import { DEFAULT_SETTINGS } from '../../src/engine/defaults'

const look = (o = {}) => ({ ...DEFAULT_SETTINGS.look, contrast: 0, ...o })
const px = (...p: number[][]) => new Uint8ClampedArray(p.flat())
const WB = px([255, 255, 255, 255], [0, 0, 0, 255])
const glyphAt = (g: ReturnType<typeof convert>, i: number) => g.glyphs[g.index[i]]

describe('convert', () => {
  it('maps white to the densest glyph and black to space', () => {
    const g = convert(WB, 2, 1, look())
    expect(glyphAt(g, 0)).toBe('@')
    expect(glyphAt(g, 1)).toBe(' ')
  })
  it('invert reverses the mapping', () => {
    const g = convert(WB, 2, 1, look({ invert: true }))
    expect(glyphAt(g, 0)).toBe(' ')
    expect(glyphAt(g, 1)).toBe('@')
  })
  it('transparent pixels become spaces', () => {
    const g = convert(px([255, 255, 255, 0]), 1, 1, look())
    expect(glyphAt(g, 0)).toBe(' ')
  })
  it('image mode keeps a red pixel red', () => {
    const g = convert(px([255, 0, 0, 255]), 1, 1, look({ colorMode: 'image' }))
    expect(Array.from(g.rgb)).toEqual([255, 0, 0])
  })
  it('sizes index and rgb for a non-square grid', () => {
    const g = convert(new Uint8ClampedArray(3 * 2 * 4).fill(200), 3, 2, look())
    expect(g.index.length).toBe(6)
    expect(g.rgb.length).toBe(18)
    expect(g.cols).toBe(3)
    expect(g.rows).toBe(2)
  })
  it('handles a 1x1 input', () => {
    const g = convert(px([255, 255, 255, 255]), 1, 1, look())
    expect(g.index.length).toBe(1)
    expect(glyphAt(g, 0)).toBe('@')
  })
  it('edges at full intensity over a uniform image give all spaces', () => {
    const g = convert(new Uint8ClampedArray(4 * 3 * 4).fill(200), 4, 3, look({ edges: true, edgeIntensity: 100 }))
    for (let i = 0; i < 12; i++) expect(glyphAt(g, i)).toBe(' ')
  })
  it('a single-glyph charset gives index 0 everywhere', () => {
    const g = convert(WB, 2, 1, look({ charset: 'a' }))
    expect(g.glyphs).toEqual(['a'])
    expect(Array.from(g.index)).toEqual([0, 0])
  })
  it('does not mutate the input', () => {
    const src = px([10, 20, 30, 128])
    const copy = Array.from(src)
    convert(src, 1, 1, look({ edges: true, edgeIntensity: 50 }))
    expect(Array.from(src)).toEqual(copy)
  })
})
