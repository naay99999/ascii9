<script lang="ts">
  interface Props {
    label: string
    value: number
    min: number
    max: number
    step: number
    oninput: (v: number) => void
    /** Text shown beside the label; defaults to the value. */
    display?: string
    disabled?: boolean
    /** Shown under the slider when disabled, saying why. */
    note?: string
  }
  let { label, value, min, max, step, oninput, display, disabled = false, note }: Props = $props()
  const id = $props.id()
  const pct = $derived(((Math.min(max, Math.max(min, value)) - min) / (max - min)) * 100)
</script>

<div class="slider" class:disabled>
  <div class="row">
    <label for={id}>{label}</label>
    <output for={id}>{display ?? String(value)}</output>
  </div>
  <div class="track">
    <div class="fill" style:width="{pct}%"></div>
    <input
      {id}
      type="range"
      {min}
      {max}
      {step}
      {value}
      {disabled}
      aria-describedby={disabled && note ? `${id}-note` : undefined}
      oninput={(e) => oninput(Number(e.currentTarget.value))}
    />
  </div>
  {#if disabled && note}<p class="note" id="{id}-note">{note}</p>{/if}
</div>

<style>
  .row {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: var(--faint);
    margin-bottom: 8px;
  }
  output {
    font-variant-numeric: tabular-nums;
    color: var(--muted);
  }
  .track {
    position: relative;
    height: 16px;
  }
  .track::before,
  .fill {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    height: 4px;
    border-radius: 2px;
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
    height: 16px;
    margin: 0;
    background: transparent;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
  }
  input::-webkit-slider-runnable-track {
    height: 16px;
    background: transparent;
  }
  input::-moz-range-track {
    height: 16px;
    background: transparent;
  }
  input::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 14px;
    height: 14px;
    margin-top: 1px;
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
  .disabled .fill,
  .disabled input::-webkit-slider-thumb {
    background: var(--faint);
  }
  .disabled input::-moz-range-thumb {
    background: var(--faint);
  }
  .disabled input {
    cursor: not-allowed;
  }
  .note {
    margin: 6px 0 0;
    font-size: 12px;
    color: var(--faint);
  }
  @media (max-width: 767px) {
    .row {
      font-size: 14px;
    }
    .track {
      height: 44px;
    }
    .track::before,
    .fill {
      top: 20px;
    }
    input,
    input::-webkit-slider-runnable-track {
      height: 44px;
    }
    input::-moz-range-track {
      height: 44px;
    }
    input::-webkit-slider-thumb {
      width: 24px;
      height: 24px;
      margin-top: 10px;
    }
    input::-moz-range-thumb {
      width: 24px;
      height: 24px;
    }
    .note {
      font-size: 14px;
    }
  }
</style>
