<script lang="ts">
  import { drawGrid } from '../render/drawGrid'
  import SampleStrip from './SampleStrip.svelte'
  import type { Grid } from '../engine/types'

  interface Props {
    grid: Grid | null
    /** Output size in px for the current grid (the frame, or the Original size). */
    size: [number, number] | null
    cellAspect: number
    dropping: boolean
    error: string
    selectedSample: string | null
    onsample: (id: string) => void
    onfile: (f: File) => void
    /** Phone layout: the zoom controls are hidden, so the art always renders at fit. */
    mobile?: boolean
  }
  let { grid, size, cellAspect, dropping, error, selectedSample, onsample, onfile, mobile = false }: Props = $props()

  const ZMIN = 0.25
  const ZMAX = 3
  const ZSTEP = 0.25
  const MAX_BACKING = 4096
  const PAD = 24

  let zoom = $state(1)
  /** The zoom actually applied; a stale desktop zoom never sticks to a phone-sized viewport. */
  const z = $derived(mobile ? 1 : zoom)
  let viewW = $state(0)
  let viewH = $state(0)
  let canvas: HTMLCanvasElement
  let dpr = $state(typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1)

  // Fitted display size (CSS px) at 100 %.
  const fit = $derived.by(() => {
    if (!size || viewW <= 0 || viewH <= 0) return null
    const aspect = size[0] / size[1]
    const aw = Math.max(1, viewW - 2 * PAD)
    const ah = Math.max(1, viewH - 2 * PAD)
    const w = Math.min(aw, ah * aspect)
    return { w, h: w / aspect }
  })

  // Backing store: device pixels, sharper when zoomed in, capped.
  const backing = $derived.by(() => {
    if (!fit) return null
    let k = dpr * Math.max(1, z)
    const long = Math.max(fit.w, fit.h) * k
    if (long > MAX_BACKING) k *= MAX_BACKING / long
    return { w: Math.max(1, Math.round(fit.w * k)), h: Math.max(1, Math.round(fit.h * k)) }
  })

  $effect(() => {
    if (!canvas || !grid || !backing) return
    if (canvas.width !== backing.w) canvas.width = backing.w
    if (canvas.height !== backing.h) canvas.height = backing.h
    const ctx = canvas.getContext('2d')
    if (ctx) drawGrid(ctx, grid, backing.w, backing.h, cellAspect)
  })

  $effect(() => {
    const mq = window.matchMedia(`(resolution: ${dpr}dppx)`)
    const update = () => (dpr = window.devicePixelRatio || 1)
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  })

  const zoomBy = (d: number) => (zoom = Math.min(ZMAX, Math.max(ZMIN, Math.round((zoom + d) / ZSTEP) * ZSTEP)))
</script>

<section class="stage" class:dropping aria-label="Preview">
  <div class="view" bind:clientWidth={viewW} bind:clientHeight={viewH}>
    <div class="sizer" role="img" aria-label="ASCII art preview" style:width="{(fit?.w ?? 0) * z + 2 * PAD}px" style:height="{(fit?.h ?? 0) * z + 2 * PAD}px">
      <canvas
        bind:this={canvas}
        class:hidden={!fit || !grid}
        style:width="{fit?.w ?? 0}px"
        style:height="{fit?.h ?? 0}px"
        style:transform="scale({z})"
        aria-hidden="true"
      ></canvas>
    </div>
  </div>

  <div class="foot">
    <SampleStrip selected={selectedSample} {onsample} {onfile} />
    <div class="tools">
      {#if grid && size}
        <span class="readout">{grid.cols} × {grid.rows} · {size[0]} × {size[1]} px</span>
      {/if}
      <div class="zoom" role="group" aria-label="Zoom">
        <button type="button" class="icon" aria-label="Zoom out" disabled={zoom <= ZMIN} onclick={() => zoomBy(-ZSTEP)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </button>
        <output class="pct" aria-live="polite">{Math.round(zoom * 100)}%</output>
        <button type="button" class="icon" aria-label="Zoom in" disabled={zoom >= ZMAX} onclick={() => zoomBy(ZSTEP)}>
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6h7M6 2.5v7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
        </button>
        <button type="button" class="fitbtn" aria-pressed={zoom === 1} onclick={() => (zoom = 1)}>Fit</button>
      </div>
    </div>
  </div>

  <p class="error" role="status">{error}</p>

  {#if dropping}
    <div class="drop" aria-hidden="true"><span>Drop to convert</span></div>
  {/if}
</section>

<style>
  .stage {
    position: relative;
    display: grid;
    grid-template-rows: minmax(0, 1fr) auto auto;
    min-width: 0;
    min-height: 0;
    border-radius: var(--radius-card);
    background: var(--ground);
  }
  .view {
    min-height: 0;
    overflow: auto;
    display: flex;
  }
  .sizer {
    flex: none;
    margin: auto;
    padding: 24px;
  }
  canvas {
    display: block;
    transform-origin: 0 0;
  }
  .hidden {
    visibility: hidden;
  }
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 4px 8px 0;
    min-width: 0;
    flex-wrap: wrap;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .readout {
    font-size: 13px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .zoom {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .icon,
  .fitbtn {
    height: 28px;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
    font-size: 13px;
  }
  .icon {
    width: 28px;
    display: grid;
    place-items: center;
  }
  .icon:hover:not(:disabled),
  .fitbtn:hover {
    color: var(--text);
    background: var(--raised);
  }
  .icon:disabled {
    color: #5e5e5e;
    cursor: default;
  }
  .fitbtn {
    padding: 0 10px;
    margin-left: 4px;
    background: var(--raised);
  }
  .fitbtn[aria-pressed='true'] {
    background: var(--text);
    color: var(--ground);
  }
  .pct {
    min-width: 40px;
    text-align: center;
    font-size: 13px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .error {
    min-height: 20px;
    margin: 6px 8px 0;
    font-size: 13px;
    color: var(--text);
  }
  .drop {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    border-radius: var(--radius-card);
    background: var(--surface);
    font-size: 18px;
    font-weight: 500;
    pointer-events: none;
  }
  @media (max-width: 767px) {
    .stage {
      border-radius: 0;
    }
    .foot {
      flex-wrap: nowrap;
      flex-direction: column;
      align-items: stretch;
      gap: 4px;
      padding: 4px 0 0;
    }
    .zoom {
      display: none;
    }
    .readout {
      font-size: 14px;
    }
    .error {
      font-size: 14px;
      margin: 2px 0 0;
    }
  }
</style>
