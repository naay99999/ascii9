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
    fillStyle: '', font: '', textBaseline: '', globalAlpha: 1,
    fillRect(...a: unknown[]) { rects.push([this.fillStyle, ...a, this.globalAlpha]) },
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
  expect(rects[0]).toEqual(['#000', 0, 0, 300, 100, 1])
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

test('shade glyphs are drawn as whole-cell rects with alpha, never as text', () => {
  const { ctx, rects, texts } = fakeCtx()
  ctx.globalAlpha = 0.9 // whatever the caller had is restored
  const g: Grid = {
    cols: 6, rows: 1, glyphs: [' ', '\u2591', '\u2592', '\u2593', '\u2588', 'x'],
    index: new Uint16Array([1, 2, 3, 4, 0, 5]),
    rgb: new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 1, 1, 1, 200, 0, 0]),
  }
  drawGrid(ctx, g, 600, 200, 0.6)
  expect(texts.map((t) => t.s)).toEqual(['x'])
  expect(texts[0].fill).toBe('rgb(200,0,0)')
  const cells = rects.slice(1)
  expect(cells.map((r) => [r[0], r[5]])).toEqual([
    ['rgb(10,20,30)', 0.25],
    ['rgb(40,50,60)', 0.5],
    ['rgb(70,80,90)', 0.75],
    ['rgb(100,110,120)', 1],
  ])
  const t = layoutText(6, 1, 600, 200, 0.6)
  for (const [k, r] of cells.entries()) {
    const [, x, y, w, h] = r as number[]
    for (const v of [x, y, w, h]) expect(Number.isInteger(v)).toBe(true)
    expect(Math.abs(x - (t.x0 + k * t.cellW))).toBeLessThanOrEqual(0.5)
    expect(Math.abs(w - t.cellW)).toBeLessThanOrEqual(1)
    expect(Math.abs(h - t.cellH)).toBeLessThanOrEqual(1)
    expect(y).toBe(Math.round(t.y0))
  }
  // neighbours meet exactly: no hairline gaps, no overlaps
  for (let k = 1; k < cells.length; k++) {
    const prev = cells[k - 1] as number[]
    expect((cells[k] as number[])[1]).toBe(prev[1] + prev[3])
  }
  expect(ctx.globalAlpha).toBe(0.9)
})

test('blocks in rows below meet the row above', () => {
  const { ctx, rects } = fakeCtx()
  const g: Grid = { cols: 1, rows: 3, glyphs: ['\u2588'], index: new Uint16Array(3), rgb: new Uint8Array(9).fill(255) }
  drawGrid(ctx, g, 97, 333, 0.6)
  const cells = rects.slice(1) as number[][]
  expect(cells).toHaveLength(3)
  for (let k = 1; k < 3; k++) expect(cells[k][2]).toBe(cells[k - 1][2] + cells[k - 1][4])
})
