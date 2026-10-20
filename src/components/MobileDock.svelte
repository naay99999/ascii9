<script lang="ts">
  import Chips from './ui/Chips.svelte'
  import Sheet from './Sheet.svelte'
  import Panel from './Panel.svelte'
  import type { Format } from './DownloadButton.svelte'
  import { settings } from '../lib/settings.svelte'
  import { PRESETS, matchPreset, applyPreset } from '../engine/defaults'
  import type { PresetId, Settings } from '../engine/types'
  import type { AutoResult } from '../lib/converter'

  interface Props {
    autoAdjust: () => Promise<AutoResult>
    save: (format: Format) => Promise<void>
    canSave: boolean
  }
  let { autoAdjust, save, canSave }: Props = $props()

  const presetOptions = (Object.keys(PRESETS) as PresetId[]).map((id) => ({ value: id, label: PRESETS[id].label }))
  const FORMATS: { value: Format; label: string }[] = [
    { value: 'png', label: 'PNG' },
    { value: 'jpg', label: 'JPG' },
    { value: 'txt', label: 'TXT' },
  ]

  const preset = $derived(matchPreset(settings.value.look))

  let adjustOpen = $state(false)
  let formatOpen = $state(false)
  let format = $state<Format>('png')
  let saving = $state(false)
  let status = $state('')
  let statusTimer: ReturnType<typeof setTimeout> | undefined

  const formatLabel = $derived(FORMATS.find((f) => f.value === format)!.label)

  function choosePreset(id: PresetId) {
    settings.value = applyPreset($state.snapshot(settings.value) as Settings, id)
  }

  async function download(f: Format) {
    if (saving || !canSave) return
    saving = true
    clearTimeout(statusTimer)
    try {
      await save(f)
      status = 'Saved'
    } catch {
      status = "Couldn't save"
    } finally {
      saving = false
    }
    statusTimer = setTimeout(() => (status = ''), 3000)
  }

  function chooseFormat(f: Format) {
    format = f
    formatOpen = false
    void download(f)
  }

  $effect(() => () => clearTimeout(statusTimer))
</script>

<div class="dock">
  <Chips scroll label="Look" options={presetOptions} value={preset === 'custom' ? null : preset} extra={preset === 'custom' ? 'Custom' : null} onchange={choosePreset} />
  <div class="actions">
    <button type="button" class="adjust" aria-haspopup="dialog" onclick={() => (adjustOpen = true)}>Adjust</button>
    <div class="dl">
      <button type="button" class="main" disabled={!canSave || saving} onclick={() => void download(format)}>Download {formatLabel}</button>
      <button
        type="button"
        class="caret"
        aria-label="Choose download format"
        aria-haspopup="dialog"
        disabled={!canSave}
        onclick={() => (formatOpen = true)}
      >
        <svg width="12" height="12" viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
      </button>
    </div>
  </div>
  <p class="status" role="status">{status}</p>
</div>

<Sheet bind:open={adjustOpen} label="Adjust">
  <Panel {autoAdjust} showLook={false} embedded />
</Sheet>

<Sheet bind:open={formatOpen} label="Download as" doneLabel="Cancel">
  <div class="formats" role="radiogroup" aria-label="Download format">
    {#each FORMATS as f (f.value)}
      <button type="button" role="radio" aria-checked={f.value === format} onclick={() => chooseFormat(f.value)}>{f.label}</button>
    {/each}
  </div>
</Sheet>

<style>
  .dock {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px var(--pad) calc(8px + env(safe-area-inset-bottom));
    border-radius: var(--radius-card) var(--radius-card) 0 0;
    background: var(--surface);
    min-width: 0;
  }
  .actions {
    display: flex;
    gap: 8px;
  }
  button {
    border: 0;
    font-size: 15px;
    font-weight: 500;
  }
  .adjust {
    flex: 1;
    height: 48px;
    border-radius: var(--radius-control);
    background: var(--raised);
    color: var(--text);
  }
  .dl {
    flex: 1.4;
    display: flex;
    gap: 2px;
    min-width: 0;
  }
  .main,
  .caret {
    height: 48px;
    background: var(--text);
    color: var(--ground);
  }
  .main {
    flex: 1;
    min-width: 0;
    border-radius: var(--radius-control) 0 0 var(--radius-control);
  }
  .caret {
    display: grid;
    place-items: center;
    width: 48px;
    border-radius: 0 var(--radius-control) var(--radius-control) 0;
  }
  .main:disabled,
  .caret:disabled {
    opacity: 0.5;
    cursor: default;
  }
  /* A fixed-height line so "Saved" appearing does not shift the layout. */
  .status {
    margin: -4px 0 0;
    min-height: 20px;
    font-size: 14px;
    color: var(--muted);
    text-align: center;
  }
  .formats {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .formats button {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 52px;
    padding: 0 20px;
    border-radius: 14px;
    background: var(--raised);
    color: var(--muted);
    text-align: left;
  }
  .formats button[aria-checked='true'] {
    background: var(--text);
    color: var(--ground);
  }
</style>
