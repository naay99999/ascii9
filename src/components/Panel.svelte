<script lang="ts">
  import Chips from './ui/Chips.svelte'
  import Segmented from './ui/Segmented.svelte'
  import Slider from './ui/Slider.svelte'
  import ColorField from './ui/ColorField.svelte'
  import MoreAdjustments from './MoreAdjustments.svelte'
  import { settings } from '../lib/settings.svelte'
  import { PRESETS, matchPreset, applyPreset } from '../engine/defaults'
  import type { ColorMode, Frame, PresetId, Settings } from '../engine/types'
  import type { AutoResult } from '../lib/converter'

  interface Props {
    /** Asks the worker for auto brightness/contrast/gamma for the current image. */
    autoAdjust: () => Promise<AutoResult>
    /** Hide the Look row (on phones it lives in the dock). */
    showLook?: boolean
    /** Rendered inside a sheet that owns the scrolling, background and radius. */
    embedded?: boolean
  }
  let { autoAdjust, showLook = true, embedded = false }: Props = $props()

  const presetOptions = (Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }))
  const colorOptions: { value: ColorMode; label: string }[] = [
    { value: 'mono', label: 'Mono' },
    { value: 'image', label: 'Image' },
    { value: 'duotone', label: 'Duotone' },
  ]
  const frameOptions: { value: Frame; label: string }[] = [
    { value: 'original', label: 'Original' },
    { value: '1:1', label: '1:1' },
    { value: '4:5', label: '4:5' },
    { value: '9:16', label: '9:16' },
    { value: '16:9', label: '16:9' },
  ]
  const fitOptions = [
    { value: 'fill', label: 'Fill' },
    { value: 'fit', label: 'Fit' },
  ] as const

  const look = $derived(settings.value.look)
  const layout = $derived(settings.value.layout)
  const preset = $derived(matchPreset(look))

  function choosePreset(id: PresetId) {
    settings.value = applyPreset($state.snapshot(settings.value) as Settings, id)
  }
</script>

<aside class="panel" class:embedded aria-label="Settings">
  {#if showLook}
  <section>
    <h2 class="lab">Look</h2>
    <Chips
      label="Look"
      options={presetOptions}
      value={preset === 'custom' ? null : preset}
      extra={preset === 'custom' ? 'Custom' : null}
      onchange={choosePreset}
    />
  </section>
  {/if}

  <section>
    <Slider
      label="Detail"
      min={20}
      max={200}
      step={5}
      value={layout.detail}
      display="{layout.detail} columns"
      oninput={(v) => (settings.value.layout.detail = v)}
    />
  </section>

  <section>
    <h2 class="lab">Color</h2>
    <Segmented label="Color" options={colorOptions} value={look.colorMode} onchange={(v) => (settings.value.look.colorMode = v)} />
    {#if look.colorMode === 'mono'}
      <div class="colors">
        <ColorField label="Glyph color" value={look.monoColor} onchange={(v) => (settings.value.look.monoColor = v)} />
      </div>
    {:else if look.colorMode === 'duotone'}
      <div class="colors two">
        <ColorField label="Dark" value={look.duo1} onchange={(v) => (settings.value.look.duo1 = v)} />
        <ColorField label="Light" value={look.duo2} onchange={(v) => (settings.value.look.duo2 = v)} />
      </div>
    {/if}
  </section>

  <section>
    <h2 class="lab">Frame</h2>
    <Chips label="Frame" options={frameOptions} value={layout.frame} onchange={(v) => (settings.value.layout.frame = v)} />
    {#if layout.frame !== 'original'}
      <div class="fit">
        <Segmented label="Fill or fit" options={fitOptions} value={layout.fit} onchange={(v) => (settings.value.layout.fit = v)} />
      </div>
    {/if}
  </section>

  <details class="more">
    <summary>More adjustments</summary>
    <div class="more-body">
      <MoreAdjustments {autoAdjust} />
    </div>
  </details>

  <p class="privacy">Your image never leaves this browser.</p>
</aside>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 22px;
    min-height: 0;
    height: 100%;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--pad);
    border-radius: var(--radius-card);
    background: var(--surface);
  }
  .panel.embedded {
    height: auto;
    overflow: visible;
    padding: 0;
    border-radius: 0;
    background: transparent;
  }
  section {
    display: flex;
    flex-direction: column;
  }
  .lab {
    margin: 0 0 8px;
    font-size: 13px;
    font-weight: 400;
    color: var(--faint);
  }
  .colors {
    display: grid;
    gap: 10px;
    margin-top: 12px;
  }
  .colors.two {
    grid-template-columns: 1fr 1fr;
  }
  .fit {
    margin-top: 10px;
  }
  .more summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 4px 0;
    font-size: 13px;
    color: var(--muted);
    cursor: pointer;
    list-style: none;
    border-radius: 6px;
  }
  .more summary::-webkit-details-marker {
    display: none;
  }
  .more summary::after {
    content: '';
    width: 7px;
    height: 7px;
    margin-right: 4px;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    transform: rotate(-45deg);
    transition: transform 120ms ease;
  }
  .more[open] summary::after {
    transform: rotate(45deg);
  }
  .more summary:hover {
    color: var(--text);
  }
  .more-body {
    padding-top: 16px;
  }
  .privacy {
    margin: auto 0 0;
    font-size: 13px;
    color: var(--faint);
  }
  @media (max-width: 767px) {
    .lab,
    .privacy {
      font-size: 14px;
    }
    .more summary {
      min-height: 44px;
      font-size: 14px;
    }
  }
</style>
