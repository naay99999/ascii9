import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS } from '../../src/engine/defaults'
import { cellColor, parseHex } from '../../src/engine/color'

const look = (o = {}) => ({ ...DEFAULT_SETTINGS.look, ...o })
const run = (l: ReturnType<typeof look>, rgb: [number, number, number], L: number) => {
  const out = new Uint8Array(3)
  cellColor(l, rgb, L, out)
  return Array.from(out)
}

describe('parseHex', () => {
  it('parses mixed case', () => {
    expect(parseHex('#00FF9f')).toEqual([0, 255, 159])
  })
})

describe('cellColor', () => {
  it('mono writes monoColor', () => {
    expect(run(look({ colorMode: 'mono', monoColor: '#00ff9f' }), [1, 2, 3], 99)).toEqual([0, 255, 159])
  })
  it('image writes the given rgb', () => {
    expect(run(look({ colorMode: 'image' }), [10, 20, 30], 99)).toEqual([10, 20, 30])
  })
  it('image ignores invert', () => {
    expect(run(look({ colorMode: 'image', invert: true }), [10, 20, 30], 99)).toEqual([10, 20, 30])
  })
  it('duotone midpoint', () => {
    const o = run(look({ colorMode: 'duotone', duo1: '#000000', duo2: '#ffffff' }), [0, 0, 0], 128)
    o.forEach((v) => expect(Math.abs(v - 128)).toBeLessThanOrEqual(1))
  })
  it('duotone invert at L=255 gives duo1', () => {
    expect(run(look({ colorMode: 'duotone', duo1: '#102030', duo2: '#ffffff', invert: true }), [0, 0, 0], 255)).toEqual([16, 32, 48])
  })
})
