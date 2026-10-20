<script lang="ts">
  import { untrack } from 'svelte'

  interface Props {
    label: string
    value: string
    onchange: (hex: string) => void
  }
  let { label, value, onchange }: Props = $props()

  const HEX = /^#[0-9a-f]{6}$/i
  const id = $props.id()

  // Local text so an invalid entry can stay in the field without touching settings.
  let text = $state(untrack(() => value))
  const invalid = $derived(!HEX.test(text))

  // Follow outside changes (preset, reset, swatch) unless the field already says the same.
  $effect(() => {
    const v = value
    untrack(() => {
      if (text.toLowerCase() !== v.toLowerCase()) text = v
    })
  })

  function commit(raw: string) {
    if (!HEX.test(raw)) return
    const hex = raw.toLowerCase()
    if (hex !== value.toLowerCase()) onchange(hex)
  }
</script>

<div class="field">
  <label for={id}>{label}</label>
  <div class="row">
    <input
      class="swatch"
      type="color"
      value={HEX.test(value) ? value.toLowerCase() : '#000000'}
      aria-label="{label} color picker"
      oninput={(e) => {
        text = e.currentTarget.value
        commit(text)
      }}
    />
    <input
      {id}
      class="hex"
      class:invalid
      type="text"
      spellcheck="false"
      autocomplete="off"
      maxlength="7"
      aria-invalid={invalid}
      aria-describedby={invalid ? `${id}-err` : undefined}
      bind:value={() => text, (v) => { text = v.trim(); commit(text) }}
    />
  </div>
  {#if invalid}<p class="err" id="{id}-err">Use a hex color like #f2f2f2</p>{/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
  }
  label {
    font-size: 12px;
    color: var(--faint);
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .swatch {
    flex: none;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    cursor: pointer;
    overflow: hidden;
  }
  .swatch::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .swatch::-webkit-color-swatch {
    border: 0;
    border-radius: 50%;
  }
  .swatch::-moz-color-swatch {
    border: 0;
    border-radius: 50%;
  }
  .hex {
    flex: 1;
    min-width: 0;
    height: 28px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--raised);
    color: var(--text);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .hex.invalid {
    outline: 1px solid var(--muted);
    outline-offset: -1px;
  }
  .hex.invalid:focus-visible {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .err {
    margin: 0;
    font-size: 12px;
    color: var(--muted);
  }
  @media (max-width: 767px) {
    label,
    .err {
      font-size: 14px;
    }
    .swatch {
      width: 44px;
      height: 44px;
    }
    .hex {
      height: 44px;
      font-size: 14px;
    }
  }
</style>
