<script lang="ts" module>
  export type VideoFormat = 'mp4' | 'webm' | 'gif'
</script>

<script lang="ts">
  import { tick } from 'svelte'
  import { gifSize } from '../engine/layout'
  import { fileName } from '../render/export'
  import { audioPlan } from '../video/audioPlan'
  import { deliveryMode, shareFile } from '../video/deliver'
  import type { VideoInfo } from '../video/probe'
  import { exportSupport, type ExportSupport } from '../video/support'

  type Choice = VideoFormat | 'png'

  interface Props {
    open: boolean
    info: VideoInfo
    /** The video export size of the art on screen (the Frame setting's size). */
    size: [number, number]
    mobile: boolean
    run(format: VideoFormat, sound: boolean, onProgress: (p: number) => void, signal: AbortSignal): Promise<Blob>
    /** Saves the frame on screen as PNG (the photo export). */
    savePng(): Promise<void>
    /** Downloads a finished file. */
    deliver(blob: Blob, name: string): void
  }
  let { open = $bindable(false), info, size, mobile, run, savePng, deliver }: Props = $props()

  const CHOICES: { value: Choice; label: string }[] = [
    { value: 'mp4', label: 'MP4' },
    { value: 'webm', label: 'WebM' },
    { value: 'gif', label: 'GIF' },
    { value: 'png', label: 'PNG · this frame' },
  ]
  const EXPORT_ERROR = "Couldn't export that video."

  let dlg = $state<HTMLDialogElement>()
  let opener: HTMLElement | null = null
  const titleId = $props.id()

  let choice = $state<Choice>('mp4')
  let sound = $state(true)
  /** What this browser can encode at `size`; null while it is being checked. */
  let support = $state.raw<ExportSupport | null>(null)
  let phase = $state<'idle' | 'running' | 'done'>('idle')
  let progress = $state(0)
  let message = $state('')
  /** A finished file waiting for the Save to Photos tap (phones that can share files). */
  let pending = $state.raw<File | null>(null)
  let controller: AbortController | null = null
  /** The Start / Cancel / Save to Photos slot: it swaps buttons, so focus follows into the new one. */
  let actions = $state<HTMLDivElement>()

  /** Offered: not known to be unsupported (MP4/WebM stay selectable while the check runs). */
  const offered = (c: Choice) => c === 'gif' || c === 'png' || support === null || support[c]
  /** Ready to start: known to work here. */
  const supported = (c: Choice) => c === 'gif' || c === 'png' || (support !== null && support[c])
  const unsupported = $derived(
    support ? (['mp4', 'webm'] as const).filter((c) => !support![c]).map((c) => (c === 'mp4' ? 'MP4' : 'WebM')) : [],
  )

  /** Why the sound box is off, or '' when it can be ticked. */
  const soundNote = $derived.by(() => {
    if (choice === 'gif' || choice === 'png') return 'Not available for GIF or PNG.'
    if (!info.audio) return 'This clip has no sound.'
    if (!support) return ''
    const canEncode = choice === 'mp4' ? support.aacEncode : support.opusEncode
    if (audioPlan(info.audio, choice, true, canEncode) === 'none') {
      return `This browser can't add sound to ${choice === 'mp4' ? 'MP4' : 'WebM'}.`
    }
    return ''
  })
  const soundOff = $derived(soundNote !== '' || (choice !== 'png' && choice !== 'gif' && !support))
  const shownSize = $derived(choice === 'gif' ? gifSize(size) : size)
  const running = $derived(phase === 'running')
  const pct = $derived(Math.round(progress * 100))

  // The native <dialog> gives the focus trap, Escape and an inert page behind it.
  $effect(() => {
    if (!dlg) return
    if (open && !dlg.open) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
      dlg.showModal()
      // Land on the chosen format rather than whatever happens to come first.
      dlg.querySelector<HTMLInputElement>('input[name="format"]:checked')?.focus()
    } else if (!open && dlg.open) {
      dlg.close()
    }
  })

  // `size` is a new array with every preview frame: key on the numbers so it only re-runs on a real change.
  const width = $derived(size[0])
  const height = $derived(size[1])

  // Check encoding support each time the dialog opens or the export size changes.
  $effect(() => {
    if (!open) return
    const at: [number, number] = [width, height]
    let stale = false
    support = null
    exportSupport(at)
      .catch(() => ({ mp4: false, webm: false, aacEncode: false, opusEncode: false, webmCodec: null }) satisfies ExportSupport)
      .then((s) => {
        if (stale) return
        support = s
        // The chosen format can't be made here: move to the first one that can.
        if (!supported(choice)) choice = s.mp4 ? 'mp4' : s.webm ? 'webm' : 'gif'
      })
    return () => {
      stale = true
    }
  })

  // Closed from outside (a new file was loaded) or unmounted: stop a running export.
  $effect(() => {
    if (!open) reset()
  })
  $effect(() => () => controller?.abort())

  /** Keeps keyboard focus in the action slot when its button is swapped (Start ↔ Cancel ↔ Save to Photos). */
  async function refocus() {
    const had = !!actions && actions.contains(document.activeElement)
    const lost = document.activeElement === document.body || document.activeElement === dlg
    await tick()
    if ((had || lost) && dlg?.open) actions?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }

  function reset() {
    controller?.abort()
    controller = null
    phase = 'idle'
    progress = 0
    message = ''
    pending = null
  }

  function choose(c: Choice) {
    if (running) return
    choice = c
    if (phase === 'done') reset()
    message = ''
  }

  async function start() {
    if (running || !supported(choice)) return
    reset()
    if (choice === 'png') {
      try {
        await savePng()
        phase = 'done'
        message = 'Saved'
      } catch {
        message = "Couldn't save that frame."
      }
      return
    }
    const format = choice
    const ac = new AbortController()
    controller = ac
    phase = 'running'
    void refocus()
    let blob: Blob
    try {
      blob = await run(format, sound && !soundOff, (p) => {
        if (controller === ac) progress = p
      }, ac.signal)
    } catch {
      // Cancel (or a close from outside) is not an error: reset() already put the dialog back to idle.
      if (controller !== ac || ac.signal.aborted) return
      controller = null
      phase = 'idle'
      message = EXPORT_ERROR
      void refocus()
      return
    }
    if (controller !== ac || ac.signal.aborted) return
    controller = null
    progress = 1
    phase = 'done'
    const name = fileName(format)
    const file = new File([blob], name, { type: blob.type })
    if (deliveryMode(typeof navigator === 'undefined' ? undefined : navigator, mobile, file) === 'share') {
      pending = file // share needs a fresh tap: show Save to Photos
      message = ''
    } else {
      deliver(blob, name)
      message = 'Saved'
    }
    void refocus()
  }

  async function saveToPhotos() {
    const file = pending
    if (!file) return
    const result = await shareFile(navigator, file)
    if (result === 'closed') return // the user closed the sheet; the button stays
    if (result === 'failed') deliver(file, file.name)
    pending = null
    message = 'Saved'
    void refocus()
  }

  function cancel() {
    reset()
    void refocus()
  }

  function oncancel(e: Event) {
    // Escape closes only when nothing is running; Cancel stops an export.
    if (running) e.preventDefault()
  }

  function onclose() {
    open = false
    opener?.focus()
    opener = null
  }

  // Close on a backdrop click only when the press also started on the backdrop, and never mid-export.
  let downOnBackdrop = false
  function onpointerdown(e: PointerEvent) {
    downOnBackdrop = e.target === dlg
  }
  function onbackdrop(e: MouseEvent) {
    if (e.target === dlg && downOnBackdrop && !running) open = false
    downOnBackdrop = false
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<dialog bind:this={dlg} class:mobile aria-labelledby={titleId} {oncancel} {onclose} {onpointerdown} onclick={onbackdrop}>
  <div class="box">
    <header>
      <h2 id={titleId}>Download video</h2>
      {#if !running}
        <button type="button" class="close" onclick={() => (open = false)}>Close</button>
      {/if}
    </header>

    <fieldset class="formats" disabled={running}>
      <legend>Format</legend>
      <div class="pills">
        {#each CHOICES as c (c.value)}
          <label class="pill" class:on={choice === c.value} class:off={!offered(c.value)}>
            <input
              type="radio"
              name="format"
              value={c.value}
              checked={choice === c.value}
              disabled={!offered(c.value)}
              onchange={() => choose(c.value)}
            />
            {c.label}
          </label>
        {/each}
      </div>
      {#if unsupported.length > 0}
        <p class="note">{unsupported.join(' and ')} {unsupported.length > 1 ? 'need' : 'needs'} a newer browser.</p>
      {/if}
    </fieldset>

    <div class="sound">
      <label class="check" class:off={soundOff}>
        <input type="checkbox" checked={sound && !soundOff} disabled={soundOff || running} onchange={(e) => (sound = e.currentTarget.checked)} />
        Include original sound
      </label>
      {#if soundNote}<p class="note">{soundNote}</p>{/if}
    </div>

    <p class="size"><span>Size</span> {shownSize[0]} × {shownSize[1]} px</p>

    {#if choice === 'gif' && info.duration > 10}
      <p class="note">Long GIFs get very large. MP4 is smaller and keeps the sound.</p>
    {/if}

    {#if running}
      <div class="progress">
        <label for="{titleId}-progress">Exporting</label>
        <progress id="{titleId}-progress" max="100" value={pct}>{pct}%</progress>
        <span class="pct" aria-hidden="true">{pct}%</span>
      </div>
      <p class="note">Closing this tab stops the export.</p>
      <div class="actions" bind:this={actions}>
        <button type="button" class="secondary" onclick={cancel}>Cancel</button>
      </div>
    {:else}
      <div class="actions" bind:this={actions}>
        <p class="status" role="status">{message}</p>
        {#if pending}
          <button type="button" class="primary" onclick={() => void saveToPhotos()}>Save to Photos</button>
        {:else}
          <button type="button" class="primary" disabled={!supported(choice)} onclick={() => void start()}>Start</button>
        {/if}
      </div>
    {/if}
  </div>
</dialog>

<style>
  dialog {
    width: min(400px, calc(100% - 32px));
    padding: 0;
    border: 0;
    border-radius: var(--radius-card);
    background: var(--surface);
    color: var(--text);
  }
  dialog::backdrop {
    background: rgba(0, 0, 0, 0.6);
  }
  dialog.mobile {
    width: 100%;
    max-width: 100%;
    max-height: 85dvh;
    margin: auto 0 0;
    border-radius: var(--radius-card) var(--radius-card) 0 0;
  }
  .box {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 12px 20px 20px;
  }
  .mobile .box {
    padding-bottom: calc(24px + env(safe-area-inset-bottom));
  }
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 32px;
  }
  h2 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
  }
  button {
    border: 0;
    border-radius: var(--radius-control);
    font-size: 13px;
    font-weight: 500;
  }
  .close,
  .secondary {
    height: 32px;
    padding: 0 16px;
    background: var(--raised);
    color: var(--text);
  }
  .primary {
    height: 32px;
    padding: 0 20px;
    background: var(--text);
    color: var(--ground);
  }
  .primary:disabled {
    opacity: 0.5;
    cursor: default;
  }
  fieldset {
    margin: 0;
    padding: 0;
    border: 0;
    min-width: 0;
  }
  legend,
  .size span,
  .progress label {
    padding: 0;
    margin-bottom: 8px;
    color: var(--muted);
    font-size: 13px;
  }
  .pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .pill {
    position: relative;
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 14px;
    border-radius: var(--radius-control);
    background: var(--raised);
    color: var(--muted);
    font-size: 13px;
    cursor: pointer;
  }
  .pill:hover:not(.on):not(.off) {
    color: var(--text);
  }
  .pill.on {
    background: var(--text);
    color: var(--ground);
  }
  .pill.off,
  fieldset:disabled .pill {
    opacity: 0.4;
    cursor: default;
  }
  fieldset:disabled .pill.on {
    opacity: 1;
  }
  /* The radio stays in the accessibility tree and keyboard order; the pill is its visible face. */
  .pill input {
    position: absolute;
    inset: 0;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }
  .pill:has(input:focus-visible) {
    outline: 2px solid var(--text);
    outline-offset: 2px;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
    cursor: pointer;
  }
  .check.off {
    color: var(--faint);
    cursor: default;
  }
  .check input {
    width: 18px;
    height: 18px;
    margin: 0;
    accent-color: var(--text);
  }
  .note {
    margin: 6px 0 0;
    color: var(--faint);
    font-size: 13px;
  }
  .size,
  .size + .note {
    margin: 0;
  }
  .size {
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }
  .size span {
    margin-right: 8px;
  }
  .progress {
    display: grid;
    grid-template-columns: 1fr auto;
    align-items: center;
    column-gap: 12px;
  }
  .progress label {
    grid-column: 1 / -1;
  }
  .progress + .note {
    margin-top: -8px;
  }
  progress {
    width: 100%;
    height: 6px;
    border: 0;
    border-radius: var(--radius-control);
    background: var(--raised);
    overflow: hidden;
    appearance: none;
  }
  progress::-webkit-progress-bar {
    background: var(--raised);
  }
  progress::-webkit-progress-value {
    background: var(--text);
    border-radius: var(--radius-control);
  }
  progress::-moz-progress-bar {
    background: var(--text);
    border-radius: var(--radius-control);
  }
  .pct {
    min-width: 4ch;
    text-align: right;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
  }
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }
  .status {
    flex: 1;
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  /* Phones: 44 px touch targets. */
  .mobile button,
  .mobile .pill {
    height: 44px;
    font-size: 14px;
  }
  .mobile .check {
    min-height: 44px;
  }
  .mobile .primary,
  .mobile .secondary {
    flex: 1;
  }
</style>
