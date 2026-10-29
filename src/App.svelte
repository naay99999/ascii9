<script lang="ts">
  import { onMount } from 'svelte'
  import TopBar from './components/TopBar.svelte'
  import Stage from './components/Stage.svelte'
  import Panel from './components/Panel.svelte'
  import MobileDock from './components/MobileDock.svelte'
  import Transport from './components/Transport.svelte'
  import type { Format } from './components/DownloadButton.svelte'
  import { settings } from './lib/settings.svelte'
  import { validateMedia, loadBitmap, imageFromClipboard, mediaFromDrop } from './lib/input'
  import { createConverter, type AutoResult, type Used, type WorkerLike } from './lib/converter'
  import { measureCellAspect } from './lib/measure'
  import { SAMPLES } from './lib/samples'
  import { exportSize, videoExportSize, type GridPlan } from './engine/layout'
  import { exportImage, fileName, gridToText } from './render/export'
  import type { Grid, Settings } from './engine/types'
  import ConvertWorker from './worker/convert.worker?worker'
  import type { VideoInfo } from './video/probe'
  import type { Player } from './video/player'
  import { openVideo, VIDEO_READ_ERROR } from './video/open'

  const ART_FONT = '400 16px "JetBrains Mono"' // taste-skill-ignore: the ASCII art itself is set in a monospace face (spec 4.2)

  let converter: ReturnType<typeof createConverter> | null = null
  let worker: Worker | null = null
  /** What each image handed to the current converter was (keyed by `Used.image`), and the blob to
   * re-decode it from if the worker has to be restarted (setImage detaches the bitmap). */
  interface ImageMeta {
    sampleId: string | null
    blob: Blob
    /** A frame of the loaded clip: sized for video export, and never re-decoded from `blob`. */
    video?: boolean
  }
  let images = new Map<number, ImageMeta>()
  let latestImage = 0
  /** Worker crashes since the last good render; recovery stops after MAX_RESTARTS in a row. */
  let crashes = 0
  const MAX_RESTARTS = 2
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
  // Both describe the art on screen: they are set when a grid for an image is shown, not when the
  // image is picked, so a failed convert never presents the previous art as the new image.
  let selectedSample = $state<string | null>(SAMPLES[0]?.id ?? null)
  let userImage = $state(false)
  let dropping = $state(false)
  let error = $state('')
  let errorTimer: ReturnType<typeof setTimeout> | undefined
  let loadSeq = 0
  /** The clip on the stage, if any. The player is not reactive: `playback` mirrors its state. */
  let video = $state.raw<{ file: File; info: VideoInfo; player: Player } | null>(null)
  let playback = $state({ playing: false, time: 0, duration: 0, muted: true })
  /** Phone layout below 768 px. Only the chrome around Stage changes; the converter and worker stay put. */
  let mobile = $state(typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches)

  function snapshot(): Settings {
    return $state.snapshot(settings.value) as Settings
  }

  const ENGINE_DEAD = 'The converter keeps failing. Reload the page to try again.'
  /** Set when the message on screen is about a render that a good grid supersedes. */
  let errorClearsOnGrid = false

  /** Inline status message; it clears after 4 s unless `sticky`. */
  function showError(message: string, opts: { clearsOnGrid?: boolean; sticky?: boolean } = {}) {
    error = message
    errorClearsOnGrid = !!opts.clearsOnGrid
    clearTimeout(errorTimer)
    if (!opts.sticky) errorTimer = setTimeout(() => (error = ''), 4000)
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
      if (seq === loadSeq && !converter) showError(ENGINE_DEAD, { sticky: true })
      return
    }
    // setImage transfers (detaches) the bitmap: nothing may touch it afterwards.
    const n = converter.setImage(bitmap)
    latestImage = n
    images.set(n, { sampleId, blob })
    // Keep only the image on screen and the newest one (blobs can be large).
    for (const k of images.keys()) if (k !== n && k !== shown?.used.image) images.delete(k)
    imageReady = true
    imageVersion++ // the settings effect sends the convert request
  }

  function onGrid(g: Grid, p: GridPlan, used: Used) {
    crashes = 0
    if (errorClearsOnGrid) {
      error = ''
      errorClearsOnGrid = false
      clearTimeout(errorTimer)
    }
    const meta = images.get(used.image)
    // exportSize may return a shared tuple: copy it.
    const sizeOf = meta?.video ? videoExportSize : exportSize
    const size = [...sizeOf(used.settings.layout, p, used.cellAspect)] as [number, number]
    shown = { grid: g, plan: p, used, size }
    if (meta) {
      selectedSample = meta.sampleId
      if (meta.sampleId === null) userImage = true
    }
  }

  /** A convert failed in the worker. The last good art stays on screen and keeps describing itself:
   * selection and hint only move when a grid for the new image arrives, so nothing to roll back. */
  function onConvertError(_message: string, used: Used) {
    const newImage = !!shown && used.image !== shown.used.image
    showError(newImage ? "Couldn't convert that image. Still showing the previous one." : "Couldn't convert that image.", {
      clearsOnGrid: true,
    })
  }

  function startEngine() {
    const w = new ConvertWorker()
    // Listeners rather than on* properties: Chromium has no Worker.onmessageerror attribute.
    w.addEventListener('error', (e) => {
      e.preventDefault()
      onCrash(w)
    })
    w.addEventListener('messageerror', () => onCrash(w))
    worker = w
    images = new Map()
    converter = createConverter(w as unknown as WorkerLike, onGrid, { onError: onConvertError, imageBase: latestImage })
  }

  function stopEngine() {
    converter?.dispose()
    converter = null
    worker?.terminate()
    worker = null
  }

  /** The worker died or sent something unreadable: replace it and re-decode the image on screen
   * (or, if nothing is shown yet, the newest one) from its kept blob. */
  function onCrash(from: Worker) {
    if (from !== worker) return // an old worker's late event
    const keep = (shown && images.get(shown.used.image)) || images.get(latestImage) || null
    stopEngine()
    imageReady = false
    crashes++
    if (crashes > MAX_RESTARTS) {
      showError(ENGINE_DEAD, { sticky: true })
      return
    }
    showError('Something went wrong converting. Reloading the engine…') // stays its 4 s: still true after recovery
    startEngine()
    if (video) {
      // The player's next frame refills the new engine; a paused clip re-delivers its frame on seek.
      if (!video.player.playing) video.player.seek(video.player.time)
    } else if (keep && !keep.video) void useBlob(keep.blob, keep.sampleId, ++loadSeq)
  }

  function closeVideo() {
    video?.player.dispose()
    video = null
  }

  /** Probe, check and start a clip. Until it is ready the previous art (and clip) stay. */
  async function useVideo(file: File, seq: number) {
    let result: Awaited<ReturnType<typeof openVideo>>
    try {
      result = await openVideo(file, {
        mobile,
        stale: () => seq !== loadSeq,
        // The old clip stops only once the new one passed its checks.
        beforePlayer: closeVideo,
        canTakeFrame: () => !!converter?.idle(),
        onFrame: (bitmap) => {
          if (seq !== loadSeq || !converter) {
            bitmap.close()
            return
          }
          // setImage transfers (detaches) the bitmap.
          const n = converter.setImage(bitmap)
          latestImage = n
          images.set(n, { sampleId: null, blob: file, video: true })
          for (const k of images.keys()) if (k !== n && k !== shown?.used.image) images.delete(k)
          imageReady = true
          imageVersion++
        },
      })
    } catch (e) {
      if (seq === loadSeq) showError(e instanceof Error ? e.message : VIDEO_READ_ERROR)
      return
    }
    if (!result) return
    const { player } = result
    video = { file, ...result }
    const sync = () => {
      playback = { playing: player.playing, time: player.time, duration: player.duration, muted: player.muted }
    }
    player.onstate = sync
    sync()
    player.play().catch(() => sync()) // autoplay refused: stays paused with its first frame shown
  }

  function useFile(f: File) {
    const check = validateMedia(f)
    if (!check.ok) {
      showError(check.message)
      return
    }
    const seq = ++loadSeq // the latest valid request wins, whatever resolves first
    if (check.kind === 'video') {
      void useVideo(f, seq)
      return
    }
    closeVideo()
    void useBlob(f, null, seq)
  }

  async function useSample(id: string) {
    const s = SAMPLES.find((x) => x.id === id)
    if (!s) return
    const seq = ++loadSeq
    closeVideo()
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

    startEngine()

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
      closeVideo()
      stopEngine()
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
    const f = mediaFromDrop(dt)
    if (f) useFile(f)
    else if (dt.files.length > 0) {
      const check = validateMedia(dt.files[0])
      showError(check.ok ? "Couldn't read that image." : check.message)
    }
  }

  // ---- Video keyboard: Space plays/pauses, Left/Right step a frame while paused ----
  /** Controls that use Space or the arrow keys themselves keep them. */
  const OWNS_SPACE = 'button, a[href], select, summary, input[type=checkbox], input[type=radio], [role=button], [role=switch], [role=radio], [role=menuitemradio]'
  const OWNS_ARROWS = 'input, select, [role=radio], [role=menuitemradio], [role=slider], [role=tab]'

  function onKeyDown(e: KeyboardEvent) {
    if (!video || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return
    if (isTextTarget(e.target) || document.querySelector('dialog[open]')) return
    const t = e.target instanceof Element ? e.target : null
    const { player } = video
    if (e.key === ' ' || e.code === 'Space') {
      if (t?.closest(OWNS_SPACE)) return
      e.preventDefault()
      togglePlay()
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      if (player.playing || t?.closest(OWNS_ARROWS)) return
      e.preventDefault()
      player.step(e.key === 'ArrowLeft' ? -1 : 1)
    }
  }

  function togglePlay() {
    const p = video?.player
    if (!p) return
    if (p.playing) p.pause()
    else p.play().catch(() => {})
  }

  function onVideoDownload() {
    // The video export dialog (Task 8) opens from here.
  }
</script>

<svelte:window onkeydown={onKeyDown} onpaste={onPaste} ondragenter={onDragEnter} ondragover={onDragOver} ondragleave={onDragLeave} ondrop={onDrop} />

{#snippet transport()}
  {#if video}
    {@const player = video.player}
    <Transport
      {...playback}
      onplay={() => void player.play().catch(() => {})}
      onpause={() => player.pause()}
      onseek={(t) => player.seek(t)}
      onstep={(dir) => player.step(dir)}
      onmute={(m) => (player.muted = m)}
    />
  {/if}
{/snippet}

<div class="app" class:mobile>
  <div class="top">
    <TopBar {userImage} canSave={!!shown} {save} {mobile} onfile={useFile} video={!!video} onvideodownload={onVideoDownload} />
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
      {mobile}
      transport={video ? transport : undefined}
    />
  </main>
  {#if mobile}
    <div class="dock-area">
      <MobileDock {autoAdjust} {save} canSave={!!shown} video={!!video} onvideodownload={onVideoDownload} />
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
    height: 100vh; /* taste-skill-ignore: fallback for browsers without dvh, overridden on the next line */
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
