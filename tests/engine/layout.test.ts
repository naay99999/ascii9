import { expect, test } from 'vitest'
import { FRAME_SIZES, gridSize, exportSize } from '../../src/engine/layout'
import type { LayoutSettings } from '../../src/engine/types'

const L = (o: Partial<LayoutSettings>) => ({ detail:80, frame:'original', fit:'fill', flipH:false, ...o }) as LayoutSettings
test('frame sizes', () => expect(FRAME_SIZES).toEqual({ '1:1':[1080,1080], '4:5':[1080,1350], '9:16':[1080,1920], '16:9':[2560,1440] }))
test('original uses image aspect', () => {
  const p = gridSize(1000, 500, L({}), 0.6)
  expect(p).toEqual({ cols:80, rows:24, crop:{ sx:0, sy:0, sw:1000, sh:500 } })
})
test('fill 1:1 crops landscape from centre', () => {
  const p = gridSize(1000, 500, L({ frame:'1:1' }), 0.6)
  expect(p.crop).toEqual({ sx:250, sy:0, sw:500, sh:500 }); expect(p.rows).toBe(48)
})
test('fit 9:16 keeps whole image, detail counts image columns', () => {
  const p = gridSize(1000, 500, L({ frame:'9:16', fit:'fit' }), 0.6)
  expect(p).toEqual({ cols:80, rows:24, crop:{ sx:0, sy:0, sw:1000, sh:500 } })
})
test('gridSize never returns zero', () => expect(gridSize(12000, 10, L({ detail:20 }), 0.6).rows).toBe(1))
test('export sizes', () => {
  expect(exportSize(L({ frame:'4:5' }), gridSize(800,800,L({frame:'4:5'}),0.6), 0.6)).toEqual([1080,1350])
  expect(exportSize(L({}), { cols:80, rows:24, crop:{sx:0,sy:0,sw:1,sh:1} }, 0.6)).toEqual([2048, 1024])
})
test('1x1 image yields at least one col and row', () => {
  for (const frame of ['original', '1:1', '16:9'] as const)
    for (const fit of ['fill', 'fit'] as const) {
      const p = gridSize(1, 1, L({ frame, fit, detail: 20 }), 0.6)
      expect(p.cols).toBeGreaterThanOrEqual(1)
      expect(p.rows).toBeGreaterThanOrEqual(1)
      expect(p.crop.sw).toBeGreaterThanOrEqual(1)
      expect(p.crop.sh).toBeGreaterThanOrEqual(1)
    }
})
test('fill portrait into 16:9 crops vertically, centred, integer', () => {
  const p = gridSize(500, 1000, L({ frame:'16:9' }), 0.6)
  expect(p.crop).toEqual({ sx:0, sy:360, sw:500, sh:281 })
  expect(p.cols).toBe(80)
  expect(p.rows).toBe(Math.round(80 * 0.6 / (16 / 9)))
})
