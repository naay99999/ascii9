import { expect, test } from 'vitest'
import { drawGrid, layoutText } from '../../src/render/drawGrid'
import type { Grid } from '../../src/engine/types'

test('layoutText fits and centres', () => {
  const t = layoutText(80, 48, 1080, 1080, 0.6)
  expect(t.cellW * 80).toBeCloseTo(t.cellH * 48)
  expect(t.x0).toBeCloseTo((1080 - t.cellW * 80) / 2)
  expect(t.y0).toBeCloseTo((1080 - t.cellH * 48) / 2)
  expect(Math.max(t.cellW * 80, t.cellH * 48)).toBeCloseTo(1080 - 2 * 1080 * 0.04)
})

function fakeCtx() {
  const rects: unknown[][] = []
  const texts: { s: string; x: number; y: number; fill: unknown }[] = []
  const ctx: any = {
    fillStyle: '', font: '', textBaseline: '',
    fillRect(...a: unknown[]) { rects.push([this.fillStyle, ...a]) },
    fillText(s: string, x: number, y: number) { texts.push({ s, x, y, fill: this.fillStyle }) },
  }
  return { ctx, rects, texts }
}

test('drawGrid fills black, skips spaces, draws index 0 when it is not a space', () => {
  const { ctx, rects, texts } = fakeCtx()
  const g: Grid = {
    cols: 3, rows: 1, glyphs: ['a', ' '], index: new Uint16Array([0, 1, 0]),
    rgb: new Uint8Array([255, 0, 0, 0, 0, 0, 0, 255, 0]),
  }
  drawGrid(ctx, g, 300, 100, 0.6)
  expect(rects[0]).toEqual(['#000', 0, 0, 300, 100])
  expect(texts.map((t) => t.s)).toEqual(['a', 'a'])
  expect(texts[0].fill).toBe('rgb(255,0,0)')
  expect(texts[1].fill).toBe('rgb(0,255,0)')
  expect(ctx.textBaseline).toBe('top')
  const t = layoutText(3, 1, 300, 100, 0.6)
  expect(texts[1].x).toBeCloseTo(t.x0 + 2 * t.cellW)
  expect(texts[0].y).toBeCloseTo(t.y0)
  expect(ctx.font).toBe(`${t.fontSize}px "JetBrains Mono"`)
})

test('drawGrid draws no text for an all-space grid', () => {
  const { ctx, texts } = fakeCtx()
  drawGrid(ctx, { cols: 2, rows: 1, glyphs: [' '], index: new Uint16Array(2), rgb: new Uint8Array(6) }, 100, 100, 0.6)
  expect(texts).toHaveLength(0)
})
