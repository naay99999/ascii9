<script lang="ts">
  interface Props {
    playing: boolean
    time: number
    duration: number
    muted: boolean
    onplay: () => void
    onpause: () => void
    onseek: (t: number) => void
    onstep: (dir: -1 | 1) => void
    onmute: (m: boolean) => void
  }
  let { playing, time, duration, muted, onplay, onpause, onseek, onstep, onmute }: Props = $props()

  /** Where the thumb is while it is being dragged; the player's own time lags behind a scrub. */
  let dragging = $state<number | null>(null)
  const pos = $derived(dragging ?? time)
  const pct = $derived(duration > 0 ? (Math.min(duration, Math.max(0, pos)) / duration) * 100 : 0)

  function clock(s: number): string {
    const t = Math.max(0, Math.floor(Number.isFinite(s) ? s : 0))
    return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`
  }
</script>

<div class="transport" role="group" aria-label="Playback">
  <button type="button" class="btn" aria-label={playing ? 'Pause' : 'Play'} onclick={() => (playing ? onpause() : onplay())}>
    {#if playing}
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.5v9M10 2.5v9" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
    {:else}
      <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M4 2.2v9.6L11.5 7z" fill="currentColor" /></svg>
    {/if}
  </button>
  <button type="button" class="btn" aria-label="Previous frame" disabled={playing} onclick={() => onstep(-1)}>
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M3 2.5v9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path d="M11.5 2.5v9L5 7z" fill="currentColor" /></svg>
  </button>
  <button type="button" class="btn" aria-label="Next frame" disabled={playing} onclick={() => onstep(1)}>
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M11 2.5v9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /><path d="M2.5 2.5v9L9 7z" fill="currentColor" /></svg>
  </button>

  <div class="track">
    <div class="fill" style:width="{pct}%"></div>
    <input
      type="range"
      aria-label="Position"
      aria-valuetext="{clock(pos)} of {clock(duration)}"
      min="0"
      max={duration > 0 ? duration : 1}
      step="any"
      value={pos}
      disabled={!(duration > 0)}
      oninput={(e) => {
        const t = Number(e.currentTarget.value)
        dragging = t
        onseek(t)
      }}
      onchange={() => (dragging = null)}
      onpointerup={() => (dragging = null)}
      onblur={() => (dragging = null)}
    />
  </div>

  <span class="time">{clock(pos)} / {clock(duration)}</span>

  <button type="button" class="btn" aria-label="Mute" aria-pressed={muted} onclick={() => onmute(!muted)}>
    {#if muted}
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z" fill="currentColor" /><path d="M11 6l3 4M14 6l-3 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    {:else}
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 6h2.5l3.5-3v10l-3.5-3H2.5z" fill="currentColor" /><path d="M11 5.5a3.5 3.5 0 0 1 0 5M12.8 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg>
    {/if}
  </button>
</div>

<style>
  .transport {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px 0;
    min-width: 0;
  }
  .btn {
    flex: none;
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border: 0;
    border-radius: var(--radius-control);
    background: transparent;
    color: var(--muted);
  }
  .btn:hover:not(:disabled) {
    color: var(--text);
    background: var(--raised);
  }
  .btn:disabled {
    color: var(--faint);
    opacity: 0.6;
    cursor: default;
  }
  .btn:first-child {
    background: var(--raised);
    color: var(--text);
  }
  .btn:first-child:hover {
    background: var(--raised-hover);
  }
  .btn[aria-pressed='false'] {
    color: var(--text);
  }
  .time {
    flex: none;
    font-size: 13px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .track {
    position: relative;
    flex: 1;
    min-width: 60px;
    height: 32px;
    margin: 0 8px;
  }
  .track::before,
  .fill {
    content: '';
    position: absolute;
    left: 0;
    top: 14px;
    height: 4px;
    border-radius: 2px;
    pointer-events: none;
  }
  .track::before {
    right: 0;
    background: var(--raised);
  }
  .fill {
    background: var(--text);
  }
  input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  input:disabled {
    cursor: default;
  }
  input::-webkit-slider-runnable-track {
    height: 32px;
    background: transparent;
  }
  input::-moz-range-track {
    height: 32px;
    background: transparent;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    margin-top: 9px;
    border-radius: 50%;
    background: var(--text);
    border: 0;
  }
  input::-moz-range-thumb {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--text);
    border: 0;
  }
  input:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
    border-radius: 8px;
  }
  @media (max-width: 767px) {
    .transport {
      gap: 2px;
      padding: 4px 0 0;
    }
    .btn {
      width: 44px;
      height: 44px;
    }
    .track {
      height: 44px;
      margin: 0 6px;
    }
    .track::before,
    .fill {
      top: 20px;
    }
    input::-webkit-slider-runnable-track {
      height: 44px;
    }
    input::-moz-range-track {
      height: 44px;
    }
    input::-webkit-slider-thumb {
      width: 20px;
      height: 20px;
      margin-top: 12px;
    }
    input::-moz-range-thumb {
      width: 20px;
      height: 20px;
    }
    .time {
      font-size: 14px;
    }
  }
</style>
