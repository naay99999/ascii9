import { expect, test } from 'vitest'
import { DEFAULT_SETTINGS, PRESETS, applyPreset, matchPreset } from '../../src/engine/defaults'
import type { Settings } from '../../src/engine/types'

test('default look is the Original preset', () => {
  expect(matchPreset(DEFAULT_SETTINGS.look)).toBe('original')
  expect(DEFAULT_SETTINGS.look).toMatchObject({ style:'ascii', colorMode:'mono', monoColor:'#f2f2f2',
    charset:' .:-=+*#%@', brightness:0, contrast:15, gamma:1, saturation:100, invert:false, edges:false, edgeIntensity:50 })
  expect(DEFAULT_SETTINGS.layout).toEqual({ detail:80, frame:'original', fit:'fill', flipH:false })
})
test('presets set unlisted look fields to defaults', () => {
  expect(PRESETS.terminal.look).toEqual({ ...DEFAULT_SETTINGS.look, monoColor:'#00ff9f', contrast:15 })
  expect(PRESETS.amber.look.charset).toBe(' .:+=*&%$#@')
  expect(PRESETS.blocks.look).toMatchObject({ style:'blocks', colorMode:'image', contrast:25 })
  expect(PRESETS.sketch.look).toMatchObject({ monoColor:'#e0e0e0', edges:true, contrast:30, invert:false })
  expect(PRESETS.neon.look).toMatchObject({ colorMode:'duotone', duo1:'#00ffff', duo2:'#ff00ff', edges:true, contrast:40 })
})
test('applyPreset keeps layout, replaces look', () => {
  const s = { ...DEFAULT_SETTINGS, layout: { detail:150, frame:'9:16', fit:'fit', flipH:true } } as Settings
  const out = applyPreset({ ...s, look: { ...s.look, gamma: 2 } }, 'amber')
  expect(out.layout).toEqual(s.layout)
  expect(out.look).toEqual(PRESETS.amber.look)
})
test('matchPreset returns custom after a manual change', () => {
  expect(matchPreset({ ...PRESETS.neon.look, contrast: 41 })).toBe('custom')
})
test('matchPreset ignores hex case', () => {
  expect(matchPreset({ ...DEFAULT_SETTINGS.look, monoColor: '#F2F2F2' })).toBe('original')
})
