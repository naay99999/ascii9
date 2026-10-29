import { convert } from './convert'
import { gridSize, type GridPlan } from './layout'
import type { Grid, Settings } from './types'

export type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

/** Samples a source (image, bitmap or video frame) into a cols x rows grid. Shared by the convert
 * worker and the video export so a still and an exported frame go through the same path. */
export function gridFromSource(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
  settings: Settings,
  cellAspect: number,
  makeCtx: (w: number, h: number) => Ctx2D,
): { grid: Grid; plan: GridPlan } {
  const plan = gridSize(srcW, srcH, settings.layout, cellAspect)
  const { cols, rows, crop } = plan
  const ctx = makeCtx(cols, rows)
  if (settings.layout.flipH) {
    ctx.translate(cols, 0)
    ctx.scale(-1, 1)
  }
  ctx.drawImage(source, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, cols, rows)
  const data = ctx.getImageData(0, 0, cols, rows).data
  const grid = convert(data, cols, rows, settings.look)
  return { grid, plan }
}
