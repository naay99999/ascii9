<script lang="ts">
  import Chips from './ui/Chips.svelte'
  import Segmented from './ui/Segmented.svelte'
  import Slider from './ui/Slider.svelte'
  import Toggle from './ui/Toggle.svelte'
  import { settings, resetSettings } from '../lib/settings.svelte'
  import { CHARSETS } from '../engine/defaults'
  import type { Style } from '../engine/types'
  import type { AutoResult } from '../lib/converter'

  interface Props {
    autoAdjust: () => Promise<AutoResult>
  }
  let { autoAdjust }: Props = $props()

  type CharsetId = keyof typeof CHARSETS
  const styleOptions: { value: Style; label: string }[] = [
    { value: 'ascii', label: 'ASCII' },
    { value: 'blocks', label: 'Blocks' },
  ]
  const charsetOptions: { value: CharsetId; label: string }[] = [
    { value: 'classic', label: 'Classic' },
    { value: 'dense', label: 'Dense' },
    { value: 'minimal', label: 'Minimal' },
  ]

  const look = $derived(settings.value.look)
  const charsetId = $derived(
    (Object.keys(CHARSETS) as CharsetId[]).find((k) => CHARSETS[k] === look.charset) ?? null,
  )
  const charsetFieldId = $props.id()

  let busy = $state(false)
  let autoNote = $state('')

  function runAuto() {
    busy = true
    autoNote = ''
    autoAdjust()
      .then((r) => {
        settings.value.look = { ...settings.value.look, brightness: r.brightness, contrast: r.contrast, gamma: r.gamma }
      })
      .catch(() => {
        autoNote = "Couldn't auto adjust this image."
      })
      .finally(() => (busy = false))
  }

  const signed = (n: number) => (n > 0 ? `+${n}` : String(n))
</script>

<div class="more">
  <div>
    <h3 class="lab">Style</h3>
    <Segmented label="Style" options={styleOptions} value={look.style} onchange={(v) => (settings.value.look.style = v)} />
  </div>

  {#if look.style === 'ascii'}
    <div>
      <h3 class="lab">Characters</h3>
      <Chips label="Characters" options={charsetOptions} value={charsetId} onchange={(id) => (settings.value.look.charset = CHARSETS[id])} />
      <label class="sr-only" for={charsetFieldId}>Custom characters, sparse to dense</label>
      <input
        id={charsetFieldId}
        class="charset"
        type="text"
        spellcheck="false"
        autocomplete="off"
        placeholder="Your own characters"
        value={look.charset}
        oninput={(e) => {
          const v = e.currentTarget.value
          if (v.trim() !== '') settings.value.look.charset = v
        }}
      />
    </div>
  {/if}

  <Slider label="Brightness" min={-100} max={100} step={1} value={look.brightness} display={signed(look.brightness)} oninput={(v) => (settings.value.look.brightness = v)} />
  <Slider label="Contrast" min={-100} max={100} step={1} value={look.contrast} display={signed(look.contrast)} oninput={(v) => (settings.value.look.contrast = v)} />
  <Slider
    label="Saturation"
    min={0}
    max={200}
    step={1}
    value={look.saturation}
    display="{look.saturation}%"
    disabled={look.colorMode !== 'image'}
    note="Image color only"
    oninput={(v) => (settings.value.look.saturation = v)}
  />
  <Slider label="Gamma" min={0.5} max={2.5} step={0.1} value={look.gamma} display={look.gamma.toFixed(1)} oninput={(v) => (settings.value.look.gamma = Math.round(v * 10) / 10)} />

  <div class="toggles">
    <Toggle label="Invert" checked={look.invert} onchange={(v) => (settings.value.look.invert = v)} />
    <Toggle label="Flip horizontal" checked={settings.value.layout.flipH} onchange={(v) => (settings.value.layout.flipH = v)} />
    <Toggle label="Edges" checked={look.edges} onchange={(v) => (settings.value.look.edges = v)} />
  </div>
  {#if look.edges}
    <Slider label="Edge intensity" min={0} max={100} step={1} value={look.edgeIntensity} oninput={(v) => (settings.value.look.edgeIntensity = v)} />
  {/if}

  <div class="actions">
    <button type="button" class="ghost" onclick={runAuto} disabled={busy}>Auto adjust</button>
    <button type="button" class="text" onclick={resetSettings}>Reset</button>
  </div>
  {#if autoNote}<p class="note" role="status">{autoNote}</p>{/if}
</div>

<style>
  .more {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }
  .lab {
    margin: 0 0 8px;
    font-size: 12px;
    font-weight: 400;
    color: var(--faint);
  }
  .charset {
    width: 100%;
    height: 28px;
    margin-top: 8px;
    padding: 0 12px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--raised);
    color: var(--text);
    font-family: var(--font-art);
    font-size: 12px;
  }
  .charset::placeholder {
    color: var(--faint);
  }
  .toggles {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .ghost {
    height: 32px;
    padding: 0 16px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--raised);
    color: var(--text);
    font-size: 13px;
    font-weight: 500;
  }
  .ghost:disabled {
    color: var(--muted);
    cursor: progress;
  }
  .text {
    height: 32px;
    padding: 0 8px;
    border: 0;
    background: transparent;
    color: var(--muted);
    font-size: 13px;
    border-radius: 6px;
  }
  .text:hover,
  .ghost:hover:not(:disabled) {
    color: var(--text);
  }
  .note {
    margin: -8px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
    white-space: nowrap;
  }
</style>
