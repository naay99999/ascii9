const FALLBACK = 0.6

/** Cell width / height of the art font, measured from 'M' at 100px. */
export function measureCellAspect(): number {
  try {
    const ctx =
      typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1).getContext('2d')
        : typeof document !== 'undefined'
          ? document.createElement('canvas').getContext('2d')
          : null
    if (!ctx) return FALLBACK
    ctx.font = '100px "JetBrains Mono", ui-monospace, monospace' // taste-skill-ignore: the ASCII art itself is set in a monospace face (spec 4.2)
    const a = ctx.measureText('M').width / 100
    return Number.isFinite(a) && a > 0 ? a : FALLBACK
  } catch {
    return FALLBACK
  }
}
