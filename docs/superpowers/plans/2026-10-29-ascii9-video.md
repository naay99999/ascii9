# ASCII9 Video Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept a video file, play it on the stage as live looping ASCII with transport controls, and export it as MP4/WebM (with or without the original sound), GIF or a PNG of the current frame, all in the browser.

**Architecture:** A hidden `<video>` element is the preview clock; the player grabs a frame whenever the existing single-flight converter is idle and hands it to the existing convert worker, so the photo pipeline (engine, worker, `drawGrid`) renders video unchanged. Export is a separate, lazily loaded pipeline: a `FrameReader` yields frames at fixed output times (WebCodecs via Mediabunny, or seeking a `<video>` as fallback), each frame is converted with the same engine code the worker uses, drawn with `drawGrid` onto a canvas, and fed to a Mediabunny `Output` (MP4/WebM) or `gifenc` (GIF). Audio is copied packet-for-packet when the container allows it, otherwise re-encoded.

**Tech Stack:** Svelte 5, TypeScript, Vite, Vitest (node environment). New dependencies: `mediabunny@1.61.4` (MPL-2.0, demux/decode/encode/mux over WebCodecs), `gifenc@1.0.3` (MIT). Both imported only via dynamic `import()`.

**Spec:** `docs/superpowers/specs/2026-10-29-ascii9-video-design.md` (builds on `docs/superpowers/specs/2026-10-21-ascii9-mvp-design.md`).

## Global Constraints

- No server code; no network request carries image or video data.
- Video limits: ≤ 200 MB; duration ≤ 60 s on desktop, ≤ 30 s on phones (`mobile` = `(max-width: 767px)`, as App already computes). Image limit stays 10 MB.
- Video export size: Frame table from MVP except 16:9 → 1920 × 1080 and Original long edge ≤ 1920; both dimensions even.
- Video export fps = source fps capped at 30. GIF: ≤ 15 fps, long edge ≤ 720 px, no sound.
- MP4 = H.264 (`avc`) + AAC. WebM = VP9 (fall back to VP8) + Opus.
- `mediabunny` and `gifenc` must never be in the initial bundle: import them only with `await import(...)`.
- Photo flow behaviour, copy and tests stay unchanged. Paste stays image-only.
- UI copy is English, MVP tone. No toasts, no emoji. Controls labelled and keyboard-operable; touch targets ≥ 44 px on mobile.
- Mediabunny API names below (`Input`, `BlobSource`, `ALL_FORMATS`, `CanvasSink`, `EncodedPacketSink`, `Output`, `BufferTarget`, `Mp4OutputFormat`, `WebMOutputFormat`, `CanvasSource`, `EncodedAudioPacketSource`, `AudioSampleSink`, `AudioSampleSource`, `canEncodeVideo`, `canEncodeAudio`) are from its documentation; confirm each against `node_modules/mediabunny/dist/*.d.ts` for 1.61.4 before using it, and keep every Mediabunny call inside `src/video/` so a rename touches one folder.

## Review Focus

1. **Portrait phone clips (rotation metadata, e.g. iPhone MOV rotated 90°).** Preview and export must have the same orientation as the clip plays in the OS. → Task 6 test `reader frames are rotated like the preview`.
2. **60 fps or variable-frame-rate clips.** Export must contain `ceil(duration × 30)` frames at even timestamps, with audio still in sync. → Task 2 test `frameTimes caps 60 fps sources at 30` and Task 6 test `video sink timestamps match frameTimes`.
3. **A new file dropped while a video plays or exports.** No frame of the old clip may appear after the new one shows; a running export is cancelled and its dialog closed. → Task 4 test `disposed player never calls onFrame again`; Task 8 step on swap-cancel.
4. **Clip with no audio track and "Include original sound" on.** Produces a silent file; the checkbox is disabled with a note. → Task 5 test `audioPlan is none without a source track`.
5. **Unknown or infinite duration (some WebM/streamed files report `Infinity` or `NaN`).** Rejected with the duration message, never accepted as "under the limit". → Task 3 test `checkDuration rejects non-finite durations`.

---

### Task 1: Share frame sampling between worker and export; add dependencies

**Files:**
- Create: `src/engine/sample.ts`
- Modify: `src/worker/convert.worker.ts` (the `convert` branch)
- Modify: `package.json`, `package-lock.json`
- Test: `tests/engine/sample.test.ts`

**Interfaces:**
- Produces: `gridFromSource(source: CanvasImageSource, srcW: number, srcH: number, settings: Settings, cellAspect: number, makeCtx: (w: number, h: number) => Ctx2D): { grid: Grid; plan: GridPlan }` where `Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D`. It does exactly what the worker's `convert` branch does today (gridSize → flipH transform → drawImage with crop → getImageData → `convert`).

- [ ] **Step 1: Write the failing test** `tests/engine/sample.test.ts`, with a fake ctx recording calls:
  - `it('draws the crop into a cols×rows context and converts it')`: settings with `detail: 10`, frame `original`, source 100×50, cellAspect 0.6 → `makeCtx` called with `(10, 3)`; `drawImage` called with `(source, 0, 0, 100, 50, 0, 0, 10, 3)`; returned `grid.cols === 10 && grid.rows === 3`.
  - `it('mirrors when flipH is set')`: `translate(10, 0)` and `scale(-1, 1)` called before `drawImage`.
- [ ] **Step 2: Run** `npx vitest run tests/engine/sample.test.ts` → FAIL (module not found).
- [ ] **Step 3: Implement `gridFromSource`** and make the worker's `convert` branch call it with its existing `ctx2d` helper.
- [ ] **Step 4: Run** `npm test` → all pass (including existing worker-independent tests).
- [ ] **Step 5: Add dependencies:** `npm install mediabunny@1.61.4 gifenc@1.0.3 --save-exact`. `gifenc` ships no types: add `src/types/gifenc.d.ts` declaring `GIFEncoder`, `quantize`, `applyPalette` as used in Task 7.
- [ ] **Step 6: Run** `npm run check` → 0 errors.
- [ ] **Step 7: Commit** `refactor(engine): share frame sampling; add mediabunny and gifenc`.

---

### Task 2: Video output sizing and frame timing

**Files:**
- Modify: `src/engine/layout.ts`
- Test: `tests/engine/layout.test.ts` (append)

**Interfaces:**
- Produces:
  - `VIDEO_LONG_EDGE = 1920`, `GIF_LONG_EDGE = 720`, `VIDEO_FPS_CAP = 30`, `GIF_FPS_CAP = 15`
  - `videoExportSize(layout: LayoutSettings, plan: GridPlan, cellAspect: number): [number, number]`
  - `gifSize(size: [number, number]): [number, number]`
  - `outputFps(sourceFps: number | null, cap: number): number`
  - `frameTimes(duration: number, fps: number): number[]` (seconds)

- [ ] **Step 1: Write failing tests:**
  - `videoExportSize`: `1:1 → [1080,1080]`, `4:5 → [1080,1350]`, `9:16 → [1080,1920]`, `16:9 → [1920,1080]`; Original with a 80×41 plan at 0.6 → long edge 1920 and both values even; an odd intermediate (pick a plan producing e.g. 1919.x) rounds to even.
  - `gifSize([1080,1920]) → [405,720]`; `gifSize([1920,1080]) → [720,405]`; `gifSize([600,400]) → [600,400]` (never upscales).
  - `outputFps(59.94, 30) → 30`; `outputFps(24, 30) → 24`; `outputFps(null, 30) → 30`; `outputFps(0, 30) → 30`.
  - `it('frameTimes caps 60 fps sources at 30')`: `frameTimes(2, outputFps(60, 30))` has length 60, first `0`, step `1/30`, last `< 2`.
  - `frameTimes(0.01, 30)` has length 1.
- [ ] **Step 2: Run** `npx vitest run tests/engine/layout.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `videoExportSize` = `exportSize` with 16:9 overridden and Original scaled to `VIDEO_LONG_EDGE`, then each side rounded to the nearest even number (min 2). `frameTimes` length = `Math.max(1, Math.ceil(duration * fps - 1e-6))`, times `i / fps`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(engine): video export sizes and frame timing`.

---

### Task 3: Accept video files

**Files:**
- Modify: `src/lib/input.ts`
- Modify: `src/components/TopBar.svelte` (`accept`), `src/components/SampleStrip.svelte` (`accept`), hint copy in TopBar
- Test: `tests/lib/input.test.ts` (append; existing image tests must pass unchanged)

**Interfaces:**
- Produces:
  - `MAX_VIDEO_BYTES = 200 * 1024 * 1024`, `MAX_VIDEO_SECONDS = { desktop: 60, mobile: 30 }`
  - `type MediaKind = 'image' | 'video'`
  - `mediaKind(f: { type: string }): MediaKind | null`
  - `validateMedia(f: { type: string; size: number }): ({ ok: true; kind: MediaKind }) | { ok: false; message: string }` — images delegate to the existing `validateFile` rules.
  - `checkDuration(seconds: number, mobile: boolean): FileCheck`
  - `mediaFromDrop(dt: { files: ArrayLike<File> }): File | null` — first image or video file. `imageFromDrop` stays for compatibility.

- [ ] **Step 1: Write failing tests:**
  - `validateMedia({type:'video/mp4', size: 1})` → `{ok:true, kind:'video'}`; `video/quicktime` likewise; `{type:'text/plain'}` → `{ok:false, message:"That file isn't an image or video."}`.
  - `video/mp4` at `200 MB + 1` → `{ok:false, message:'That video is over 200 MB.'}`; exactly 200 MB → ok.
  - `image/png` over 10 MB still → `'That image is over 10 MB.'`.
  - `checkDuration(60, false)` ok; `checkDuration(60.5, false)` → `'That video is longer than 60 seconds.'`; `checkDuration(31, true)` → `'That video is longer than 30 seconds.'`.
  - `it('checkDuration rejects non-finite durations')`: `Infinity`, `NaN`, `0` → `{ok:false, message:"Couldn't read that video's length."}`.
  - `mediaFromDrop` returns the first video when no image is present, and skips `text/plain`.
- [ ] **Step 2: Run** `npx vitest run tests/lib/input.test.ts` → FAIL.
- [ ] **Step 3: Implement**, then set both file inputs to `accept="image/*,video/*"` and change the desktop hint to `'Drop an image or video, or paste an image, to replace the sample'` (user-image variant: `'Drop or paste to replace'` unchanged).
- [ ] **Step 4: Run** `npm test && npm run check` → pass.
- [ ] **Step 5: Commit** `feat(input): accept video files with size and duration limits`.

---

### Task 4: Probe and player

**Files:**
- Create: `src/video/probe.ts`, `src/video/player.ts`
- Modify: `src/lib/converter.ts` (add `idle()`)
- Test: `tests/lib/converter.test.ts` (append), `tests/video/player.test.ts`

**Interfaces:**
- Produces:
  - `interface VideoInfo { duration: number; width: number; height: number; fps: number | null; rotation: 0 | 90 | 180 | 270; videoCodec: string | null; canDecode: boolean; audio: { codec: string; sampleRate: number; channels: number } | null }`
  - `probeVideo(file: Blob): Promise<VideoInfo>` in `probe.ts` — dynamic-imports Mediabunny (`Input` + `BlobSource` + `ALL_FORMATS`), reads the primary video/audio tracks; `fps` from packet stats; `canDecode` from the video track's decode check. Throws `Error("Couldn't read that video.")` when there is no video track.
  - `converter.idle(): boolean` — true when nothing is in flight, queued or scheduled.
  - `createPlayer(file: Blob, opts: { onFrame: (bitmap: ImageBitmap, time: number) => void; canTakeFrame: () => boolean; fps: number }): Player`
  - `interface Player { ready: Promise<void>; readonly playing: boolean; readonly time: number; readonly duration: number; muted: boolean; play(): Promise<void>; pause(): void; seek(t: number): void; step(dir: -1 | 1): void; dispose(): void; onstate?: () => void }`
  - The player owns a hidden, `playsinline`, `muted`-by-default, `loop` `<video>` with an object URL; on each `requestVideoFrameCallback` (fallback: `requestAnimationFrame` + `timeupdate`) it calls `createImageBitmap(video)` **only when `canTakeFrame()`** and passes it to `onFrame`. After `seek`/`step`/`pause` it always delivers one frame for the new position (on `seeked`). `step` moves `±1/fps` and pauses. `onstate` fires on play/pause/time/mute changes (throttle time updates to ~4 Hz).

- [ ] **Step 1: Write failing tests:**
  - converter: `idle()` true initially; false right after `request`; true after the grid reply.
  - player (fake `document.createElement('video')` object with stubbed `play`, `pause`, `requestVideoFrameCallback`, event listeners; stub `createImageBitmap` and `URL.createObjectURL/revokeObjectURL`):
    - `it('skips frames while the converter is busy')`: with `canTakeFrame` returning false, firing the frame callback does not call `onFrame`.
    - `it('step pauses and moves one frame')`: fps 25, time 1 → `step(1)` sets `currentTime` to `1.04` and `playing === false`.
    - `it('disposed player never calls onFrame again')`: after `dispose()`, firing frame and `seeked` callbacks calls nothing; the object URL is revoked.
- [ ] **Step 2: Run** `npx vitest run tests/lib/converter.test.ts tests/video/player.test.ts` → FAIL.
- [ ] **Step 3: Implement** `idle()`, `probe.ts`, `player.ts`.
- [ ] **Step 4: Run** → PASS; `npm run check` clean.
- [ ] **Step 5: Commit** `feat(video): probe clips and drive frames from a hidden video element`.

---

### Task 5: Live preview, transport and wiring in App

**Files:**
- Create: `src/components/Transport.svelte`
- Modify: `src/App.svelte`, `src/components/Stage.svelte` (optional `transport?: Snippet` rendered between `.view` and `.foot`), `src/components/TopBar.svelte`, `src/components/MobileDock.svelte`
- Create: `src/video/audioPlan.ts`
- Test: `tests/video/audioPlan.test.ts`

**Interfaces:**
- Consumes: Task 3 `validateMedia`, `checkDuration`, `mediaFromDrop`; Task 4 `probeVideo`, `createPlayer`, `converter.idle()`; Task 2 `videoExportSize`.
- Produces:
  - In App: `let video = $state<{ file: File; info: VideoInfo; player: Player } | null>(null)`. When non-null, `shown.size` uses `videoExportSize` instead of `exportSize`.
  - `Transport.svelte` props: `{ playing: boolean; time: number; duration: number; muted: boolean; onplay(): void; onpause(): void; onseek(t: number): void; onstep(dir: -1 | 1): void; onmute(m: boolean): void }`. Contents per spec 4.3: play/pause, step ◀|/|▶ (enabled only when paused), a range input scrubber (`aria-label="Position"`), `m:ss / m:ss` readout, mute toggle (`aria-pressed`).
  - TopBar/MobileDock: new props `video: boolean` and `onvideodownload: () => void`; when `video`, the Download control is a single `Download` button calling `onvideodownload` (no format menu).
  - `type AudioPlan = 'copy' | 'encode' | 'none'`; `audioPlan(source: VideoInfo['audio'], container: 'mp4' | 'webm', wanted: boolean, canEncode: boolean): AudioPlan` — `copy` when the source codec is native to the container (`aac` for mp4; `opus`/`vorbis` for webm), else `encode` if `canEncode`, else `none`; `none` whenever `!wanted` or no source.

- [ ] **Step 1: Write failing tests** for `audioPlan`:
  - `('aac','mp4',true,false) → 'copy'`; `('opus','mp4',true,true) → 'encode'`; `('opus','mp4',true,false) → 'none'`; `('aac','webm',true,true) → 'encode'`; `('opus','webm',true,false) → 'copy'`; `(any,'mp4',false,true) → 'none'`.
  - `it('audioPlan is none without a source track')`: `(null,'mp4',true,true) → 'none'`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement `audioPlan.ts`. **Step 4:** run → PASS.
- [ ] **Step 5: Wire App.** `useFile` uses `validateMedia`. For video: `++loadSeq`; `probeVideo` → `checkDuration(info.duration, mobile)` → dispose any old player → `createPlayer` with `canTakeFrame: () => !!converter?.idle()` and `onFrame: (bmp) => { const n = converter.setImage(bmp); images.set(n, { sampleId: null, blob: file }); imageReady = true; imageVersion++ }`; autoplay on ready. Any stale `seq` disposes the player it created. Loading a photo or sample disposes the player and sets `video = null`. Crash recovery with a video loaded: restart the engine and let the next player frame refill it (don't `useBlob` the video file). Errors: probe/decode failure → `"Couldn't read that video."`, limits → messages from Task 3. Keyboard (window `keydown`, ignored in text targets and while a dialog is open): Space toggles play, ArrowLeft/ArrowRight step when paused.
- [ ] **Step 6: Manual check** with `npm run dev`: drop a phone MP4 and a portrait MOV → loops as ASCII in the right orientation within ~2 s; drag Detail and switch presets while playing → art updates, playback continues, sliders don't freeze; pause, scrub, step, mute, keyboard all work; drop a photo → transport disappears, photo flow unchanged; drop a 61 s clip → message, previous art stays. Mobile width (devtools 390 px): transport sits above the dock, targets ≥ 44 px.
- [ ] **Step 7: Run** `npm test && npm run check` → pass.
- [ ] **Step 8: Commit** `feat(video): live ASCII preview with transport controls`.

---

### Task 6: Frame readers and MP4/WebM export

**Files:**
- Create: `src/video/readers.ts`, `src/video/exportVideo.ts`, `src/video/support.ts`
- Test: `tests/video/exportVideo.test.ts`

**Interfaces:**
- Consumes: Task 1 `gridFromSource`; Task 2 `videoExportSize`, `outputFps`, `frameTimes`, `VIDEO_FPS_CAP`; Task 5 `audioPlan`; `drawGrid`.
- Produces:
  - `interface FrameReader { frames(times: number[], signal: AbortSignal): AsyncIterable<{ time: number; image: CanvasImageSource; width: number; height: number; close(): void }> }`
  - `webCodecsReader(file: Blob): Promise<FrameReader>` (Mediabunny `CanvasSink` over the primary video track, rotation applied) and `seekReader(file: Blob): FrameReader` (hidden `<video>`, set `currentTime`, await `seeked`, `createImageBitmap(video)`); `pickReader(file, info)` returns the first when `info.canDecode`, else the second.
  - `interface ExportSupport { mp4: boolean; webm: boolean; aacEncode: boolean; opusEncode: boolean; webmCodec: 'vp9' | 'vp8' | null }`; `exportSupport(size: [number, number]): Promise<ExportSupport>` via `canEncodeVideo` / `canEncodeAudio`.
  - `interface VideoJob { file: Blob; info: VideoInfo; settings: Settings; cellAspect: number; container: 'mp4' | 'webm'; sound: boolean; support: ExportSupport }`
  - `exportVideo(job: VideoJob, opts: { reader: FrameReader; onProgress(p: number): void; signal: AbortSignal; sink?: VideoSinkFactory }): Promise<Blob>` — size from `videoExportSize(settings.layout, gridSize(...), cellAspect)`, fps `outputFps(info.fps, VIDEO_FPS_CAP)`, times `frameTimes(info.duration, fps)`. Per frame: `gridFromSource` → `drawGrid` onto one reused canvas of the export size → add to the video source with timestamp `time` and duration `1/fps` → `onProgress((i + 1) / times.length)` → `await` a macrotask so Cancel and progress stay live. Audio per `audioPlan`: `copy` → `EncodedAudioPacketSource` fed from the input's `EncodedPacketSink`; `encode` → `AudioSampleSink` → `AudioSampleSource` (`aac` for mp4, `opus` for webm). MP4 uses `fastStart: 'in-memory'`. Bitrate: Mediabunny's `QUALITY_HIGH` (builder may tune). On abort: cancel the output, throw `DOMException('Aborted', 'AbortError')`.
  - `VideoSinkFactory` is the seam tests replace: `(size, fps, container) => { add(canvas, t: number, d: number): Promise<void>; finish(): Promise<Blob>; cancel(): Promise<void> }`. The default implementation wraps Mediabunny `Output` + `CanvasSource`.

- [ ] **Step 1: Write failing tests** (fake reader yielding small `{ width, height, image }` objects; fake sink recording calls; stub `OffscreenCanvas` with a minimal 2D context recording `drawImage`/`fillText`):
  - `it('video sink timestamps match frameTimes')`: info `{duration: 1, fps: 60}` → sink `add` called 30 times with `t = i/30`, `d = 1/30`; sink created with fps 30 and the `videoExportSize` of the settings.
  - `it('reports monotonic progress ending at 1')`.
  - `it('cancels on abort')`: abort after the 3rd frame → rejects with `AbortError`, `sink.cancel` called, `finish` not called.
  - `it('reader frames are rotated like the preview')`: for `webCodecsReader`, assert the `CanvasSink` is constructed with rotation applied (Mediabunny's default / `rotation` option per its d.ts) so a 1920×1080 rotation-90 track yields 1080×1920 frames — mock the Mediabunny module with `vi.mock('mediabunny', …)`.
  - `pickReader` picks `seekReader` when `info.canDecode === false`.
- [ ] **Step 2: Run** `npx vitest run tests/video/exportVideo.test.ts` → FAIL.
- [ ] **Step 3: Implement** `readers.ts`, `support.ts`, `exportVideo.ts`.
- [ ] **Step 4: Run** → PASS; `npm run check` clean.
- [ ] **Step 5: Commit** `feat(video): render clips to MP4 and WebM with original audio`.

---

### Task 7: GIF and current-frame PNG export

**Files:**
- Create: `src/video/exportGif.ts`
- Test: `tests/video/exportGif.test.ts`

**Interfaces:**
- Consumes: Task 6 `FrameReader`, `VideoJob` (fields `file`, `info`, `settings`, `cellAspect`); Task 2 `gifSize`, `outputFps`, `frameTimes`, `GIF_FPS_CAP`.
- Produces: `exportGif(job: Pick<VideoJob,'file'|'info'|'settings'|'cellAspect'>, opts: { reader: FrameReader; onProgress(p: number): void; signal: AbortSignal }): Promise<Blob>` (`image/gif`). Per frame: same render as Task 6 at `gifSize(videoExportSize(...))`, `quantize(rgba, 256)` → `applyPalette` → `writeFrame(index, w, h, { palette, delay: Math.round(1000 / fps) })`. PNG of the current frame needs no new code: it is the existing `save('png')` on `shown`.

- [ ] **Step 1: Write failing tests** (real `gifenc` runs in node; fake reader + stubbed canvas returning solid-colour `getImageData`):
  - `it('writes a GIF89a with one frame per output time')`: `{duration: 1, fps: 30}` → bytes start with `GIF89a`, and the fake reader was asked for 15 times.
  - `it('cancels on abort')` → rejects with `AbortError`.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement. **Step 4:** run → PASS.
- [ ] **Step 5: Commit** `feat(video): GIF export`.

---

### Task 8: Video download dialog, mobile save, end-to-end check

**Files:**
- Create: `src/components/VideoDownloadDialog.svelte`, `src/video/deliver.ts`
- Modify: `src/App.svelte`, `src/render/export.ts` (`fileName` accepts `'mp4' | 'webm' | 'gif'`)
- Test: `tests/video/deliver.test.ts`, `tests/render/export.test.ts` (append)

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces:
  - `fileName(ext: 'png' | 'jpg' | 'txt' | 'mp4' | 'webm' | 'gif', d?: Date): string`
  - `deliveryMode(nav: { canShare?: (d: { files: File[] }) => boolean } | undefined, mobile: boolean, file: File): 'share' | 'download'` — `share` only when `mobile` and `canShare({ files: [file] })` is true.
  - `VideoDownloadDialog.svelte` props: `{ open: boolean (bindable); info: VideoInfo; size: [number, number]; mobile: boolean; run(format: 'mp4'|'webm'|'gif', sound: boolean, onProgress: (p: number) => void, signal: AbortSignal): Promise<Blob>; savePng(): Promise<void>; deliver(blob: Blob, name: string): void }`. A native `<dialog>` (Escape closes when idle). Contents per spec 4.4: format segmented (MP4 default, WebM, GIF, PNG · this frame); "Include original sound" checkbox (default on; disabled with note "This clip has no sound." when `info.audio` is null, "Not available for GIF or PNG." for those, and "This browser can't add sound to MP4." when `audioPlan` is `none` with sound wanted); read-only size line (`1080 × 1920 px`, or the `gifSize` for GIF); with GIF selected and `info.duration > 10`, the note "Long GIFs get very large. MP4 is smaller and keeps the sound."; Start; during the run a `<progress>` with percentage, Cancel, and the note "Closing this tab stops the export."; formats unsupported per `exportSupport` are disabled with "Needs a newer browser." When done: desktop → download and quiet "Saved"; mobile with `deliveryMode === 'share'` → a **Save to Photos** button that calls `navigator.share({ files: [file] })` (needs the tap, so not automatic); a share `AbortError` (user closed the sheet) is not an error.
- [ ] **Step 1: Write failing tests:** `fileName('mp4', new Date(2026, 9, 29)) === 'ascii9-2026-10-29.mp4'`; `deliveryMode` → `share` on mobile with `canShare` true, `download` when not mobile, when `canShare` is missing, or when it returns false.
- [ ] **Step 2: Run** → FAIL. **Step 3:** implement `deliver.ts`, the `fileName` change and the dialog; wire it in App (`onvideodownload` opens it; `run` snapshots settings and `shown.used.cellAspect` at Start, picks the reader with `pickReader`, calls `exportVideo` or `exportGif`). Loading a new file while the dialog is running aborts the run and closes the dialog. **Step 4:** run `npm test && npm run check` → pass.
- [ ] **Step 5: Build and bundle check:** `npm run build`; confirm `mediabunny` and `gifenc` code is only in lazily loaded chunks (`grep -l "Mp4OutputFormat\|GIFEncoder" dist/assets/*.js` must not match the entry chunk referenced by `dist/index.html`).
- [ ] **Step 6: Manual acceptance** (`npm run preview`), against spec §6:
  - Desktop Chrome, Safari, Firefox: export a 20 s phone clip to MP4 with sound → plays in QuickTime with sound in sync at the Frame's size; sound off → silent; WebM, GIF, PNG work; Cancel stops; an iPhone HEVC clip in Firefox either exports through the seek fallback or shows "Couldn't read that video." on load.
  - iPhone Safari: 30 s clip → Save to Photos → the MP4 is in Photos and selectable in the IG app; a 31 s clip is rejected.
  - Network panel shows no request carrying media during load, preview or export.
  - Photo flow: samples, drop, paste, PNG/JPG/TXT unchanged.
- [ ] **Step 7: Commit** `feat(video): download dialog with format, sound and save to Photos`.
