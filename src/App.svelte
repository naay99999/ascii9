<script lang="ts">
  import { onMount } from 'svelte'
  import TopBar from './components/TopBar.svelte'
  import Stage from './components/Stage.svelte'
  import Panel from './components/Panel.svelte'
  import MobileDock from './components/MobileDock.svelte'
  import type { Format } from './components/DownloadButton.svelte'
  import { settings } from './lib/settings.svelte'
  import { validateFile, loadBitmap, imageFromClipboard, imageFromDrop } from './lib/input'
  import { createConverter, type AutoResult, type Used, type WorkerLike } from './lib/converter'
  import { measureCellAspect } from './lib/measure'
  import { SAMPLES } from './lib/samples'
  import { exportSize, type GridPlan } from './engine/layout'
  import { exportImage, fileName, gridToText } from './render/export'
  import type { Grid, Settings } from './engine/types'
  import ConvertWorker from './worker/convert.worker?worker'

  const ART_FONT = '400 16px "JetBrains Mono"'

  let converter: ReturnType<typeof createConverter> | null = null
  let cellAspect = $state(0.6)
  /** Resolves when the art font is in (or after a 3 s grace), so the first measure and draw use it. */
  let fontGate: Promise<unknown> = Promise.resolve()
  let imageReady = $state(false)
  /** Bumped after each new image (and when the font arrives) so the one request effect re-runs. */
  let imageVersion = $state(0)
  let fontVersion = $state(0)

  /** The art on screen, described ONLY by what produced it. Readout, preview and every export read
   * from this bundle, never from the current settings, so what you see is what you download even
   * while a newer request is in flight. */
  interface Shown {
    grid: Grid
    plan: GridPlan
    used: Used
    size: [number, number]
  }
  let shown = $state.raw<Shown | null>(null)
  let selectedSample = $state<string | null>(SAMPLES[0]?.id ?? null)
  let userImage = $state(false)
  let dropping = $state(false)
  let error = $state('')
  let errorTimer: ReturnType<typeof setTimeout> | undefined
  let loadSeq = 0
  /** Phone layout below 768 px. Only the chrome around Stage changes; the converter and worker stay put. */
  let mobile = $state(typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)

  function snapshot(): Settings {
    return $state.snapshot(settings.value) as Settings
  }

  function showError(message: string) {
    error = message
    clearTimeout(errorTimer)
    errorTimer = setTimeout(() => (error = ''), 4000)
  }

  /** Decode a blob and hand it to the worker. On failure the current image stays. */
  async function useBlob(blob: Blob, sampleId: string | null, seq: number) {
    if (seq !== loadSeq) return
    let bitmap: ImageBitmap
    try {
      bitmap = await loadBitmap(blob)
    } catch (e) {
      if (seq === loadSeq) showError(e instanceof Error ? e.message : "Couldn't read that image.")
      return
    }
    await fontGate
    if (seq !== loadSeq || !converter) {
      bitmap.close()
      return
    }
    // setImage transfers (detaches) the bitmap: nothing may touch it afterwards.
    converter.setImage(bitmap)
    imageReady = true
    imageVersion++ // the settings effect sends the convert request
    selectedSample = sampleId
    if (sampleId === null) userImage = true
  }

  function useFile(f: File) {
    const check = validateFile(f)
    if (!check.ok) {
      showError(check.message)
      return
    }
    const seq = ++loadSeq // the latest valid image request wins, whatever resolves first
    void useBlob(f, null, seq)
  }

  async function useSample(id: string) {
    const s = SAMPLES.find((x) => x.id === id)
    if (!s) return
    const seq = ++loadSeq
    try {
      const res = await fetch(s.src)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      await useBlob(blob, id, seq)
    } catch {
      if (seq === loadSeq) showError("Couldn't load that sample.")
    }
  }

  // The single request path: re-convert whenever a setting, the cell aspect, the image or the font changes.
  $effect(() => {
    const s = snapshot()
    const a = cellAspect
    void imageVersion
    void fontVersion
    if (imageReady && converter) converter.request(s, a)
  })

  onMount(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const onMq = () => (mobile = mq.matches)
    onMq()
    mq.addEventListener('change', onMq)

    const worker = new ConvertWorker()
    converter = createConverter(worker as unknown as WorkerLike, (g, p, used) => {
      // exportSize may return a shared tuple: copy it.
      const size = [...exportSize(used.settings.layout, p, used.cellAspect)] as [number, number]
      shown = { grid: g, plan: p, used, size }
    })

    // Canvas text never triggers the @font-face load by itself: ask for the art font before the
    // first measure and draw. If it is slow, go ahead after 3 s and re-measure once it arrives.
    let disposed = false
    const fontLoad: Promise<unknown> = document.fonts ? document.fonts.load(ART_FONT).catch(() => undefined) : Promise.resolve()
    fontGate = Promise.race([fontLoad, new Promise((r) => setTimeout(r, 3000))]).then(() => {
      if (!disposed) cellAspect = measureCellAspect()
    })
    void fontLoad.then(() => {
      if (disposed) return
      const a = measureCellAspect()
      if (a !== cellAspect) cellAspect = a
      else fontVersion++ // same aspect: still redraw with the real font
    })

    if (SAMPLES[0]) void useSample(SAMPLES[0].id)

    return () => {
      mq.removeEventListener('change', onMq)
      disposed = true
      converter?.dispose()
      converter = null
      worker.terminate()
      clearTimeout(errorTimer)
    }
  })

  function autoAdjust(): Promise<AutoResult> {
    if (!converter || !imageReady) return Promise.reject(new Error('No image'))
    return converter.autoAdjust()
  }

  function saveBlob(blob: Blob, name: string) {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    // Browsers that ignore `download` (older iOS Safari) would navigate away from the app: open a tab instead.
    const canDownload = 'download' in (a as HTMLAnchorElement)
    const link = a as HTMLAnchorElement
    if (canDownload) a.download = name
    else {
      link.target = '_blank'
      link.rel = 'noopener'
    }
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), canDownload ? 10_000 : 120_000)
  }

  async function save(format: Format) {
    const art = shown // exactly what is on screen
    if (!art) throw new Error('Nothing to save yet')
    if (format === 'txt') {
      saveBlob(new Blob([gridToText(art.grid)], { type: 'text/plain;charset=utf-8' }), fileName('txt'))
      return
    }
    const type = format === 'png' ? 'image/png' : 'image/jpeg'
    const blob = await exportImage(art.grid, [art.size[0], art.size[1]], art.used.cellAspect, type)
    saveBlob(blob, fileName(format))
  }

  // ---- Global input: paste and drag/drop anywhere on the page ----
  function isTextTarget(t: EventTarget | null): boolean {
    // Only text-entry fields keep a paste for themselves; a focused slider, swatch or button does not.
    if (!(t instanceof HTMLElement)) return false
    if (t.isContentEditable) return true
    return t.matches(
      'textarea, input:not([type=range]):not([type=color]):not([type=file]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]):not([type=reset]):not([type=image])',
    )
  }

  function onPaste(e: ClipboardEvent) {
    if (isTextTarget(e.target)) return
    const items = e.clipboardData?.items
    if (!items) return
    const f = imageFromClipboard(items)
    if (!f) return
    e.preventDefault()
    useFile(f)
  }

  let dragDepth = 0
  const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')

  function onDragEnter(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth++
    dropping = true
  }
  function onDragOver(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }
  function onDragLeave(e: DragEvent) {
    if (!hasFiles(e)) return
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) dropping = false
  }
  function onDrop(e: DragEvent) {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth = 0
    dropping = false
    const dt = e.dataTransfer
    if (!dt) return
    const f = imageFromDrop(dt)
    if (f) useFile(f)
    else if (dt.files.length > 0) {
      const first = dt.files[0]
      const check = validateFile(first)
      showError(check.ok ? "Couldn't read that image." : check.message)
    }
  }
</script>

<svelte:window onpaste={onPaste} ondragenter={onDragEnter} ondragover={onDragOver} ondragleave={onDragLeave} ondrop={onDrop} />

<div class="app" class:mobile>
  <div class="top">
    <TopBar {userImage} canSave={!!shown} {save} {mobile} onfile={useFile} />
  </div>
  <main class="stage-area">
    <Stage
      grid={shown?.grid ?? null}
      size={shown?.size ?? null}
      cellAspect={shown?.used.cellAspect ?? cellAspect}
      {dropping}
      {error}
      {selectedSample}
      onsample={(id) => void useSample(id)}
      onfile={useFile}
    />
  </main>
  {#if mobile}
    <div class="dock-area">
      <MobileDock {autoAdjust} {save} canSave={!!shown} />
    </div>
  {:else}
    <div class="panel-area">
      <Panel {autoAdjust} />
    </div>
  {/if}
</div>

<style>
  .app {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 280px;
    grid-template-rows: 48px minmax(0, 1fr);
    grid-template-areas:
      'top top'
      'stage panel';
    column-gap: 12px;
    height: 100vh;
    height: 100dvh;
    padding: 0 12px 12px;
    overflow: hidden;
  }
  .top {
    grid-area: top;
    min-width: 0;
  }
  .stage-area {
    grid-area: stage;
    display: grid;
    min-width: 0;
    min-height: 0;
  }
  .panel-area {
    grid-area: panel;
    min-height: 0;
  }
  .dock-area {
    grid-area: dock;
    min-width: 0;
  }
  .app.mobile {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 56px minmax(0, 1fr) auto;
    grid-template-areas:
      'top'
      'stage'
      'dock';
    padding: 0;
  }
  .app.mobile .stage-area {
    margin: 0 var(--pad);
  }
</style>
