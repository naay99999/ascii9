import { describe, expect, it, vi } from 'vitest'
import { gridFromSource } from '../../src/engine/sample'
import { DEFAULT_SETTINGS } from '../../src/engine/defaults'

function fakeCtx() {
  const calls: string[] = []
  const ctx = {
    translate: vi.fn((...a: number[]) => calls.push(`translate(${a})`)),
    scale: vi.fn((...a: number[]) => calls.push(`scale(${a})`)),
    drawImage: vi.fn((..._a: unknown[]) => calls.push('drawImage')),
    getImageData: vi.fn((_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(w * h * 4).fill(128),
    })),
  }
  return { ctx, calls }
}

const settings = (flipH: boolean) => ({
  ...DEFAULT_SETTINGS,
  layout: { ...DEFAULT_SETTINGS.layout, detail: 10, frame: 'original' as const, flipH },
})

describe('gridFromSource', () => {
  it('draws the crop into a cols×rows context and converts it', () => {
    const { ctx } = fakeCtx()
    const makeCtx = vi.fn(() => ctx as never)
    const source = {} as CanvasImageSource
    const { grid } = gridFromSource(source, 100, 50, settings(false), 0.6, makeCtx)
    expect(makeCtx).toHaveBeenCalledWith(10, 3)
    expect(ctx.drawImage).toHaveBeenCalledWith(source, 0, 0, 100, 50, 0, 0, 10, 3)
    expect(grid.cols).toBe(10)
    expect(grid.rows).toBe(3)
  })
  it('mirrors when flipH is set', () => {
    const { ctx, calls } = fakeCtx()
    gridFromSource({} as CanvasImageSource, 100, 50, settings(true), 0.6, () => ctx as never)
    expect(ctx.translate).toHaveBeenCalledWith(10, 0)
    expect(ctx.scale).toHaveBeenCalledWith(-1, 1)
    expect(calls.indexOf('drawImage')).toBeGreaterThan(calls.indexOf('scale(-1,1)'))
  })
})
