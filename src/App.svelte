<script lang="ts">
  import { onMount } from 'svelte'
  import TopBar from './components/TopBar.svelte'
  import Stage from './components/Stage.svelte'
  import Panel from './components/Panel.svelte'
  import type { Format } from './components/DownloadButton.svelte'
  import { settings } from './lib/settings.svelte'
  import { validateFile, loadBitmap, imageFromClipboard, imageFromDrop } from './lib/input'
  import { createConverter, type AutoResult, type WorkerLike } from './lib/converter'
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
  let grid = $state.raw<Grid | null>(null)
  let plan = $state.raw<GridPlan | null>(null)
  let selectedSample = $state<string | null>(SAMPLES[0]?.id ?? null)
  let userImage = $state(false)
  let dropping = $state(false)
  let error = $state('')
  let errorTimer: ReturnType<typeof setTimeout> | undefined
  let loadSeq = 0

  // Output size for the grid on screen. exportSize may return a shared tuple: copy it.
  const size = $derived<[number, number] | null>(
    grid && plan ? [...exportSize(settings.value.layout, plan, cellAspect)] as [number, number] : null,
  )

  function snapshot(): Settings {
    return $state.snapshot(settings.value) as Settings
  }

  function showError(message: string) {
    error = message
    clearTimeout(errorTimer)
    errorTimer = setTimeout(() => (error = ''), 4000)
  }

  /** Decode a blob and hand it to the worker. On failure the current image stays. */
  async function useBlob(blob: Blob, sampleId: string | null) {
    const seq = ++loadSeq
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
    converter.request(snapshot(), cellAspect)
    imageReady = true
    selectedSample = sampleId
    if (sampleId === null) userImage = true
  }

  function useFile(f: File) {
    const check = validateFile(f)
    if (!check.ok) {
      showError(check.message)
      return
    }
    void useBlob(f, null)
  }

  async function useSample(id: string) {
    const s = SAMPLES.find((x) => x.id === id)
    if (!s) return
    try {
      const res = await fetch(s.src)
      if (!res.ok) throw new Error(String(res.status))
      await useBlob(await res.blob(), id)
    } catch {
      showError("Couldn't load that sample.")
    }
  }

  // Re-convert whenever any setting (or the measured cell aspect) changes.
  $effect(() => {
    const s = snapshot()
    const a = cellAspect
    if (imageReady && converter) converter.request(s, a)
  })

  onMount(() => {
    const worker = new ConvertWorker()
    converter = createConverter(worker as unknown as WorkerLike, (g, p) => {
      grid = g
      plan = p
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
      if (a !== cellAspect) cellAspect = a // the settings effect re-requests
      else if (imageReady) converter?.request(snapshot(), a)
    })

    if (SAMPLES[0]) void useSample(SAMPLES[0].id)

    return () => {
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
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
  }

  async function save(format: Format) {
    const g = grid
    const sz = size
    if (!g || !sz) throw new Error('Nothing to save yet')
    if (format === 'txt') {
      saveBlob(new Blob([gridToText(g)], { type: 'text/plain;charset=utf-8' }), fileName('txt'))
      return
    }
    const blob = await exportImage(g, sz, cellAspect, format === 'png' ? 'image/png' : 'image/jpeg')
    saveBlob(blob, fileName(format))
  }

  // ---- Global input: paste and drag/drop anywhere on the page ----
  function isTextTarget(t: EventTarget | null): boolean {
    if (!(t instanceof HTMLElement)) return false
    return t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t.isContentEditable
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

<div class="app">
  <div class="top">
    <TopBar {userImage} canSave={!!grid} {save} />
  </div>
  <main class="stage-area">
    <Stage
      {grid}
      {size}
      {cellAspect}
      {dropping}
      {error}
      {selectedSample}
      onsample={(id) => void useSample(id)}
      onfile={useFile}
    />
  </main>
  <div class="panel-area">
    <Panel {autoAdjust} />
  </div>
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
</style>
