# ASCII9 MVP: design

| | |
|---|---|
| Date | 2026-10-21 |
| Status | Draft for review |
| Supersedes | `prd.md` (2026-10-20) where they differ. `prd.md` is still the reference for the conversion maths it describes. |

## 1. Intent

ASCII9 turns a photo into ASCII art in the browser, and the user downloads it as an image.

The rebuild replaces a demo made with Lovable. The owner couldn't change much in that code. The new codebase must be one the owner can read and change themselves.

What the owner wants, in their words: a nicer UI/UX than before, easy to use, a site that *only* converts images to ASCII art, no complexity, lean, and efficient with resources.

**What success looks like**
- A first-time visitor understands what the site does within seconds, without reading instructions.
- They get from their own photo to a downloaded PNG they're happy with in a few clicks.
- The page is small and fast, and stays responsive while settings change.

**Main use of the output:** people take the image away for social posts, profile pictures and wallpapers (phone and desktop). Image export is the core feature. Text export is secondary.

## 2. Goals, non-goals, anti-goals

**Goals**
- One screen that loads, converts and exports.
- Output images at the exact pixel sizes those uses need.
- All processing stays in the browser. No image ever leaves the device.

**Non-goals for the MVP** (they may come later)
- Video and animated GIF. The owner deferred these explicitly. A GIF uses its first frame.
- The Gallery page, the 404 page and any routing.
- The Emoji and Hybrid styles.
- The Grayscale and ANSI 16 colour modes.
- Dithering.
- Settings in the URL and share links.
- The Share button.
- SVG, HTML and Markdown export.
- Vertical flip.
- A light theme and a theme toggle.
- Accounts, backend, analytics on images.

**Anti-goals** (failures even if everything works)
- The page looks like the old demo, or like a generic template: terminal window frames, glows, CRT scanlines, neon, gradient blobs, chromatic text.
- The controls overwhelm. A newcomer faces a wall of sliders.
- The site feels heavy: a large bundle, jank while dragging a slider, a flickering preview.
- The code is hard to follow (the reason for the rebuild).

## 3. Constraints

- Static hosting only (target: Vercel). No server code.
- Latest two versions of Chrome, Safari, Firefox and Edge, including iOS Safari and Android Chrome.
- Keyboard-operable and labelled controls. Text contrast meets WCAG AA.
- Privacy: no network request carries image data.

## 4. Decisions

Decisions marked **(owner)** were made by the owner. Decisions marked **(Claude)** are Claude's calls. The owner heard them and didn't object, but may still change them.

### 4.1 Stack (Claude, at owner's request: "whatever fits best")
- **Svelte 5 + Vite + TypeScript.** It produces a small bundle, and the markup stays readable and easy to edit.
- **Conversion engine in plain TypeScript**, independent of Svelte. It runs in a **Web Worker with `OffscreenCanvas`**.
- **Preview is drawn to a `<canvas>`**, not to per-character DOM spans.
- **Hand-written CSS with custom properties.** No Tailwind and no component kit.
- **Minimal dependencies:** no router, no animation library, no toast library.
- **Vitest** for the engine.
- Deploy as a static site on Vercel.

### 4.2 Look (owner chose direction "A, Dark studio" from mockups)
- A true-black ground (`#000`) with white glyphs, like the owner's reference image of a flower in white ASCII on black.
- Layout on desktop: a slim top bar with the wordmark `ascii9`, a short hint, and one primary **Download** button on the right. Below it, the large preview stage takes most of the width. A narrow settings panel (about 250–300 px) sits on the right.
- Surfaces are separated by lightness steps only: `#000` ground, `#111` panel, `#2a2a2a` controls. There are no borders or shadows on resting surfaces.
- Text uses `#fff`, `#b4b4b4` and `#949494`.
- The primary action is a white pill with black text. Chips and segmented controls are pills, with the selected item inverted (white on black).
- One UI typeface, Inter. The art uses a monospace face (JetBrains Mono or similar), loaded once and also used in export.
- None of the old demo's ornaments survive (see anti-goals). No emoji in the UI.
- The source tokens are in `.taste-skill/app/direction.json` (style `true-black-flat`). Ignore its lime accent. The UI has no accent hue, and colour comes only from the art.
- The build follows the design-taste-frontend skill's app-screen rules, and its inspector should pass.

### 4.3 First screen (owner chose "2, open on a finished result")
- On first load, a bundled sample image is already converted and shown in the stage. Download works immediately.
- Under the stage is a row of sample thumbnails (3–4 samples) and a "Choose your image" link.
- The hint in the top bar says to drop or paste an image to replace the sample.
- Dropping, pasting (Ctrl/Cmd+V, listener on `window` at all times) or choosing a file replaces the current image. Settings are kept.
- While a file is dragged over the window, the whole stage shows a clear drop state.
- Validation: the MIME type must be `image/*` and the file must be ≤ 10 MB. Otherwise show a short inline message. No toast library is used.
- Samples: bundled locally and licensed for reuse (CC0 or public domain). They are compressed (WebP, ≤ 1600 px long edge). Choosing the subjects and finding them is left to the builder **(Claude)**. They should look good in ASCII: strong subject, simple background (a portrait, an animal, a flower, a landmark).

### 4.4 Settings panel (Claude, owner approved the scope)
The panel shows four things up front:

1. **Look**: preset chips. Settings come in two groups **(Claude)**:
   - *Look settings*: style, colour mode and its colours, charset, brightness, contrast, gamma, saturation, invert, edges and edge intensity.
   - *Layout settings*: Detail, Frame, Fill/Fit and flip.

   Choosing a preset replaces **all** look settings. Any look setting the table doesn't list goes back to its default. Layout settings stay as they are. The chip shows "Custom" whenever the current look settings differ from every preset, detected by comparing values with no dirty flag. Changing Detail or Frame never turns the chip to Custom. **Reset** restores everything to defaults, including Frame. Both groups persist.
2. **Detail**: columns, 20–200, step 5, default 80.
3. **Color**: segmented control with Mono, Image and Duotone. Mono shows a colour swatch and hex input (default `#f2f2f2`). Duotone shows two colours.
4. **Frame**: Original, 1:1, 4:5, 9:16, 16:9, plus a **Fill / Fit** toggle when the frame is not Original **(owner: let the user choose)**. Fill is the default **(Claude)**. Fill crops the image to the frame ratio from the centre. Fit shows the whole image centred on the background.

**More adjustments** (collapsed by default) holds:
- Style: ASCII or Blocks. ASCII and Color ASCII from the PRD are merged into one ASCII style.
- Character set: Classic, Dense, Minimal, plus free text. Hidden for Blocks.
- Brightness, contrast, gamma and saturation. Saturation applies only when Color is Image.
- Invert, flip horizontal, edge detection with intensity.
- **Auto adjust**, which sets brightness, contrast and gamma (PRD 4.4).
- **Reset**, which restores the defaults.

Every slider shows its value next to its label.

**Presets (Look chips)** (Claude, adapted from PRD 4.7; the builder tunes the exact values by eye on the samples):

| Chip | Style | Color | Charset | Notes |
|---|---|---|---|---|
| Original (default) | ASCII | Mono `#f2f2f2` | Classic | contrast 15 |
| Terminal | ASCII | Mono `#00ff9f` | Classic | |
| Amber | ASCII | Mono `#ffb000` | `" .:+=*&%$#@"` | |
| Blocks | Blocks | Image | — | contrast 25 |
| Sketch | ASCII | Mono `#e0e0e0` | Classic | edges on, contrast 30 |
| Neon | ASCII | Duotone `#00ffff`→`#ff00ff` | Classic | edges on, contrast 40 |

Settings and the selected frame persist in `localStorage`, with try/catch and safe defaults if storage is unavailable. The user's image is never stored.

### 4.5 Conversion engine
The engine follows PRD 4.3 for tone adjustment, saturation, invert, luminance, Sobel edges, colour modes and Auto adjust, with these changes:

- **Ramp direction for a dark ground.** The PRD maps bright pixels to the start of the ramp (the space), which suits a light background. On black, bright pixels must map to *dense* glyphs: `i = round(L/255 × (n−1))`.
- **Invert (Claude, replaces PRD step 6).** Invert flips the luminance used for choosing glyphs and for Duotone's `t`, giving `L' = 255 − L`. It does not turn the image's colours into a negative. In Image mode the cells keep the photo's real colours, and in Duotone the two colours swap ends. Edges already come out bright on black, so Sketch doesn't need invert.
- **Structured output.** The engine returns a cell grid: per cell, a glyph index and an RGB colour, as typed arrays. Preview, PNG/JPG and TXT are all derived from it. Nothing parses HTML.
- **Graphemes.** Custom character sets are split with `Intl.Segmenter`.
- **Edge borders.** Sobel clamps at the borders instead of leaving a black frame.
- **Grid shape.** Rows come from the target aspect and the real cell aspect of the monospace font. Measure it once, about 0.6 wide to 1 tall. The PRD's fixed 0.5 factor is replaced by this. With a Frame, the grid fills the frame (Fill), or fits the image inside it (Fit).
- **Fit mode (Claude).** Detail always counts the columns across the image itself. The grid has the image's aspect ratio and is centred in the frame. The empty bands are plain background drawn outside the grid, not blank cells. TXT therefore contains only the image grid, and the size readout reports that grid. In Fill mode the grid is the frame.
- **Debounce and cancellation.** Work is debounced (about 50–100 ms) and stale jobs are dropped. The previous render stays on screen until the new one is ready, so there is no spinner flicker.
- **Performance target:** a preview update within about 150 ms at 120 columns on a mid-range laptop. The UI stays responsive at 200.

### 4.6 Preview
- The canvas fits the stage by default, with zoom in/out and a "fit" control.
- The preview shows the chosen Frame with its real proportions and background, so what you see is what you download.
- The output size is shown quietly, for example "80 × 41 · 1080 × 1350 px".

### 4.7 Export (Claude, from owner: "people take the image away")
- The **Download** button saves PNG by default. A small format menu next to it offers JPG and TXT.
- File name: `ascii9-YYYY-MM-DD.<ext>`.
- **Exact sizes:**

  | Frame | Size |
  |---|---|
  | 1:1 | 1080 × 1080 |
  | 4:5 | 1080 × 1350 |
  | 9:16 | 1080 × 1920 |
  | 16:9 | 2560 × 1440 |
  | Original | Long edge about 2048 px, following the grid's aspect |

  The art is rendered at a font size that fills the frame (less a small margin), not at a fixed size.
- The background is the stage's black, not the old demo's `#fafaf8`.
- Each export is drawn from the cell grid onto a canvas at the target size, using the same font as the preview. Wait for `document.fonts.ready` before drawing.
- TXT is the plain glyph grid with `\n` line endings.
- After a download, show a quiet inline "Saved" note. There are no toasts.

### 4.8 Mobile (Claude, shown in mockup, owner didn't object)
- The preview is full width under a slim bar (wordmark, Replace).
- A bottom dock holds a horizontally scrolling row of Look chips, an **Adjust** button and a **Download** button.
- Adjust opens a bottom sheet with Detail, Color, Frame and More adjustments.
- Touch targets are at least 44 px. The page never scrolls sideways.

### 4.9 Page furniture
- The title is "ASCII9 – Image to ASCII Art Converter", with a meta description and our own OG image made from an ASCII render. The demo used Lovable's default.
- A one-line privacy note at the foot of the panel or page: "Your image never leaves this browser."

## 5. Left to the builder
- Component structure, file layout, state management inside Svelte, and the worker message protocol.
- Exact spacing, sizes and motion, within the look in 4.2 and the design-taste-frontend app rules. Motion stays minimal: control feedback and a gentle fade when the render swaps.
- Exact preset tuning, sample choice, the font file, and the export margin.
- Test scope. At minimum, unit tests for the engine: ramp mapping, tone maths, grid sizing per frame, grapheme splitting, and Sobel borders.
- The tone of the copy, in English. The UI language is English.

## 6. Acceptance (MVP)
- [ ] On load, a sample is shown converted. Drop, paste (at any time), file picker and sample thumbnails all replace it. Bad or oversized files show a message.
- [ ] Look, Detail, Color, Frame (Fill/Fit) and every item in More adjustments change the preview live, without jank at 200 columns.
- [ ] PNG and JPG downloads match the frame's exact pixel size. TXT downloads the glyph grid. Characters such as `< > & "` in a custom charset appear correctly everywhere.
- [ ] The preview matches the downloaded image.
- [ ] Desktop and mobile layouts match 4.2 and 4.8.
- [ ] The network panel shows no image data leaving the browser.
- [ ] The engine's unit tests pass. The design-taste-frontend app inspector reports no FAIL.
