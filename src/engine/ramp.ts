import { BLOCK_RAMP, CHARSETS } from './defaults'
import type { LookSettings } from './types'

export function splitGlyphs(s: string): string[] {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const seg = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' })
    return Array.from(seg.segment(s), (x: any) => x.segment as string)
  }
  return Array.from(s)
}

/** Glyph ramp, darkest to densest. [0] is ' ' for ramps of two or more glyphs; a single-glyph
 * charset returns just that glyph, which then fills every cell. */
export function rampFor(look: LookSettings): string[] {
  if (look.style === 'blocks') return Array.from(BLOCK_RAMP)
  const custom = look.charset.trim() === '' ? CHARSETS.classic : look.charset
  const glyphs = splitGlyphs(custom)
  if (glyphs.length === 1) return glyphs // single glyph fills every cell
  return glyphs[0] === ' ' ? glyphs : [' ', ...glyphs]
}

export function glyphIndex(L: number, n: number, invert: boolean): number {
  const i = Math.round(((invert ? 255 - L : L) / 255) * (n - 1))
  return i <= 0 ? 0 : i > n - 1 ? n - 1 : i
}
