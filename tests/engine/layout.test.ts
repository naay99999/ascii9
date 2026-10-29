import { describe, expect, it, test } from 'vitest'
import { FRAME_SIZES, gridSize, exportSize, videoExportSize, gifSize, outputFps, frameTimes } from '../../src/engine/layout'
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

describe('row cap for extreme portrait shapes', () => {
  const cap = (cols: number) => Math.max(cols * 4, 400)
  test.each([
    [1, 4096, 80],
    [1, 4096, 200],
    [240, 4096, 200],
  ])('%ix%i at detail %i stays within the cap', (w, h, detail) => {
    for (const fit of ['fill', 'fit'] as const) {
      const frame = fit === 'fit' ? '9:16' : 'original'
      const p = gridSize(w, h, L({ detail, frame, fit }), 0.6)
      expect(p.cols).toBe(detail)
      expect(p.rows).toBeGreaterThanOrEqual(1)
      expect(p.rows).toBeLessThanOrEqual(cap(detail))
      // cropped vertically from the centre, integer, inside the image
      expect(p.crop.sx).toBe(0)
      expect(p.crop.sw).toBe(w)
      for (const v of Object.values(p.crop)) expect(Number.isInteger(v)).toBe(true)
      expect(p.crop.sh).toBeGreaterThanOrEqual(1)
      expect(p.crop.sh).toBeLessThan(h)
      expect(Math.abs(p.crop.sy - (h - p.crop.sh) / 2)).toBeLessThanOrEqual(0.5)
    }
  })
  test('240x4096 at 200 keeps the cell aspect of the cropped region', () => {
    const p = gridSize(240, 4096, L({ detail: 200 }), 0.6)
    expect(p.rows).toBe(800)
    expect(p.crop).toEqual({ sx: 0, sy: 1248, sw: 240, sh: 1600 })
  })
  test('shapes under the cap are untouched', () => {
    const p = gridSize(1000, 3000, L({ detail: 80 }), 0.6)
    expect(p).toEqual({ cols: 80, rows: 144, crop: { sx: 0, sy: 0, sw: 1000, sh: 3000 } })
  })
})

describe('exportSize gaps', () => {
  test('a Fit frame exports at the frame size', () => {
    const l = L({ frame: '9:16', fit: 'fit' })
    expect(exportSize(l, gridSize(1000, 500, l, 0.6), 0.6)).toEqual([1080, 1920])
  })
  test('portrait Original: the long edge is the height', () => {
    const l = L({ detail: 80 })
    const p = gridSize(500, 1000, l, 0.6)
    expect(p.rows).toBe(96)
    expect(exportSize(l, p, 0.6)).toEqual([1024, 2048])
  })
  test('capped portrait Original exports with the capped grid aspect', () => {
    const l = L({ detail: 80 })
    const p = gridSize(1, 4096, l, 0.6)
    const [w, h] = exportSize(l, p, 0.6)
    expect(h).toBe(2048)
    expect(w / h).toBeCloseTo((p.cols * 0.6) / p.rows, 2)
  })
  test('1x1 image: exact crop and a square-ish export', () => {
    const l = L({ detail: 20 })
    const p = gridSize(1, 1, l, 0.6)
    expect(p.crop).toEqual({ sx: 0, sy: 0, sw: 1, sh: 1 })
    expect(p).toEqual({ cols: 20, rows: 12, crop: { sx: 0, sy: 0, sw: 1, sh: 1 } })
    expect(exportSize(l, p, 0.6)).toEqual([2048, 2048])
  })
})

describe('video sizing and timing', () => {
  const plan = (cols: number, rows: number) => ({ cols, rows, crop: { sx: 0, sy: 0, sw: 1, sh: 1 } })
  test('videoExportSize frames', () => {
    expect(videoExportSize(L({ frame: '1:1' }), plan(80, 80), 0.6)).toEqual([1080, 1080])
    expect(videoExportSize(L({ frame: '4:5' }), plan(80, 80), 0.6)).toEqual([1080, 1350])
    expect(videoExportSize(L({ frame: '9:16' }), plan(80, 80), 0.6)).toEqual([1080, 1920])
    expect(videoExportSize(L({ frame: '16:9' }), plan(80, 80), 0.6)).toEqual([1920, 1080])
  })
  test('videoExportSize original has long edge 1920 and even sides', () => {
    expect(videoExportSize(L({}), plan(80, 41), 0.6)).toEqual([1920, 1640])
  })
  test('videoExportSize rounds an odd intermediate to even', () => {
    // 79 cols at 0.6 = 47.4 wide, 41 rows: height 1660.76 -> 1660 (not odd 1661)
    expect(videoExportSize(L({}), plan(79, 41), 0.6)).toEqual([1920, 1660])
    expect(videoExportSize(L({}), plan(1, 1), 0.6)).toEqual([1152, 1920])
  })
  test('gifSize', () => {
    expect(gifSize([1080, 1920])).toEqual([405, 720])
    expect(gifSize([1920, 1080])).toEqual([720, 405])
    expect(gifSize([600, 400])).toEqual([600, 400])
  })
  test('outputFps', () => {
    expect(outputFps(59.94, 30)).toBe(30)
    expect(outputFps(24, 30)).toBe(24)
    expect(outputFps(null, 30)).toBe(30)
    expect(outputFps(0, 30)).toBe(30)
  })
  it('frameTimes caps 60 fps sources at 30', () => {
    const t = frameTimes(2, outputFps(60, 30))
    expect(t).toHaveLength(60)
    expect(t[0]).toBe(0)
    expect(t[1]).toBeCloseTo(1 / 30)
    expect(t[59]).toBeLessThan(2)
  })
  test('frameTimes has at least one frame', () => expect(frameTimes(0.01, 30)).toHaveLength(1))
})
