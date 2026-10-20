import { describe, expect, it } from 'vitest'
import { CHARSETS, DEFAULT_SETTINGS } from '../../src/engine/defaults'
import { CHARSET_MAX, charsetFromInput, glyphIndex, rampFor, splitGlyphs } from '../../src/engine/ramp'

const look = (o = {}) => ({ ...DEFAULT_SETTINGS.look, ...o })

describe('splitGlyphs', () => {
  it('keeps emoji clusters whole', () => {
    expect(splitGlyphs('a❤️b☘️')).toEqual(['a', '❤️', 'b', '☘️'])
  })
  it('keeps markup chars as single cells', () => {
    expect(splitGlyphs(' <&">')).toHaveLength(5)
  })
})

describe('rampFor', () => {
  it('falls back to Classic when empty', () => {
    expect(rampFor(look({ charset: '' }))).toEqual(splitGlyphs(CHARSETS.classic))
  })
  it('uses the block ramp for blocks style', () => {
    expect(rampFor(look({ style: 'blocks', charset: 'xyz' }))).toEqual([' ', '░', '▒', '▓', '█'])
  })
  it('prepends a space when missing', () => {
    expect(rampFor(look({ charset: 'ab' }))).toEqual([' ', 'a', 'b'])
  })
  it('single non-space glyph fills every cell', () => {
    expect(rampFor(look({ charset: 'a' }))).toEqual(['a'])
    expect(rampFor(look({ charset: '❤️' }))).toEqual(['❤️'])
  })
  it('whitespace-only charset falls back to Classic', () => {
    expect(rampFor(look({ charset: ' ' }))).toEqual(splitGlyphs(CHARSETS.classic))
    expect(rampFor(look({ charset: '   ' }))).toEqual(splitGlyphs(CHARSETS.classic))
  })
  it('keeps a leading space as is', () => {
    expect(rampFor(look({ charset: ' ab' }))).toEqual([' ', 'a', 'b'])
  })
})

describe('glyphIndex', () => {
  it('maps bright to dense', () => {
    expect(glyphIndex(255, 10, false)).toBe(9)
    expect(glyphIndex(0, 10, false)).toBe(0)
  })
  it('invert flips', () => {
    expect(glyphIndex(255, 10, true)).toBe(0)
    expect(glyphIndex(0, 10, true)).toBe(9)
  })
  it('single-glyph ramp is 0', () => {
    expect(glyphIndex(200, 1, false)).toBe(0)
  })
  it('clamps', () => {
    expect(glyphIndex(300, 10, false)).toBe(9)
    expect(glyphIndex(-5, 10, false)).toBe(0)
  })
})

describe('charsetFromInput', () => {
  it('an empty or blank field means Classic', () => {
    expect(charsetFromInput('')).toBe(CHARSETS.classic)
    expect(charsetFromInput('   ')).toBe(CHARSETS.classic)
  })
  it('keeps what was typed', () => expect(charsetFromInput(' .oO@')).toBe(' .oO@'))
  it('caps the length at 256 characters without splitting a surrogate pair', () => {
    expect(charsetFromInput('x'.repeat(300))).toHaveLength(CHARSET_MAX)
    const out = charsetFromInput('😀'.repeat(300))
    expect(Array.from(out)).toHaveLength(128)
    expect(out.length).toBeLessThanOrEqual(CHARSET_MAX)
  })
})
