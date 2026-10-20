# PRD — ASCII9: Image to ASCII Art Converter (Rebuild)

| | |
|---|---|
| Status | Draft, for rebuild |
| Source | Existing demo (`naay99999/ascii9`, built with Lovable) |
| Date | 2026-10-20 |

This document records what the current demo does, including the exact conversion rules, so the new site can match or improve on it. Section 9 lists the demo's known defects and gaps. The rebuild should fix these rather than copy them.

---

## 1. Product summary

ASCII9 is a single-page web app that turns an image into text art (ASCII, colored ASCII, Unicode blocks or emoji). It shows a live preview that updates as settings change and can export the result as an image, text or markup file.

All processing happens in the user's browser. Images are never uploaded or stored. This privacy promise is shown in the footer and is a core product value.

### Goals
- Get from "drop an image" to a good-looking result in seconds, with no account and no upload.
- Expose enough controls (style, color, tone, effects) for creative results without overwhelming new users.
- Offer one-click presets for well-known looks (retro terminal, neon, pixel, emoji, sketch).
- Export results in formats that suit social posts, chat, READMEs and web pages.
- Work well on both desktop and mobile.

### Non-goals (current scope)
- User accounts, cloud storage, or a server-side processing backend.
- Video or animated GIF conversion (only the first frame is used).
- A public, user-submitted gallery.

---

## 2. Target users

- **Casual creators** want a fun avatar or social post image quickly. They use presets and samples.
- **Developers** want ASCII text for READMEs, terminal banners or code comments. They export TXT or Markdown.
- **Designers/artists** fine-tune tone, color and edges for stylized output. They export PNG or HTML.

---

## 3. Information architecture

| Route | Page | Purpose |
|---|---|---|
| `/` | Converter (home) | Upload, preview, adjust, export |
| `/gallery` | Preset gallery | Browse, search and filter presets; click one to apply it on `/` |
| `*` | 404 | Not found |

**Header (all pages):** logo `>_ ASCII9` with the subtitle "Image to ASCII Art Converter", a link to Gallery, and a "Ctrl+V to paste" hint. On mobile, the nav collapses into a right-side sheet menu (Home, Gallery) that also shows the paste hint.

**Footer:** "🔒 Privacy First: All images are processed locally in your browser. Nothing is uploaded or stored." and "ASCII9 © {year}".

---

## 4. Functional requirements

### 4.1 Image input

| ID | Requirement |
|---|---|
| IN-1 | Drag and drop an image onto the upload zone. The zone shows a "DROP TO UPLOAD" state while a file is dragged over it. |
| IN-2 | Click the upload zone to open the file picker (`accept="image/*"`). |
| IN-3 | Paste an image from the clipboard (Ctrl/Cmd+V) anywhere on the page. |
| IN-4 | Sample images: four built-in thumbnails ("Try with samples": Cat Boss, Mountain, Classic Car, Portrait). One click loads a sample as if the user had uploaded it. |
| IN-5 | Validation: the file's MIME type must start with `image/` and the file must be 10 MB or smaller. Otherwise show an error toast ("Invalid file type" or "File too large (max 10MB)"). |
| IN-6 | Supported formats advertised: JPG, PNG, WebP, GIF (GIF uses the first frame only). |
| IN-7 | Success toast "Image loaded successfully!". The image is decoded into an `HTMLImageElement` through a data URL. |
| IN-8 | A **Clear** button in the preview header removes the image and output and returns to the upload zone. Settings are kept. |

### 4.2 Conversion settings

All settings live in one `ConversionSettings` object. Any change triggers reconversion (see 4.3).

| Setting | Type / range | Default | Notes |
|---|---|---|---|
| `style` | `ascii` \| `colorAscii` \| `emoji` \| `block` \| `hybrid` | `colorAscii` | UI labels: Classic ASCII (@), Color ASCII (#), Emoji Mosaic (😀), Block Art (█), Hybrid (⚡) |
| `density` | 20–200 columns, step 5 | 80 | Quick buttons: Low 40, Medium 80, High 120, Ultra 160 |
| `charset` | string | `" .:-=+*#%@"` | Shown only for ascii, colorAscii and hybrid. Presets plus a free-text input (see below). |
| `emojiSet` | string | `😀😃😄😁😆😅🤣😂🙂🙃😉😊😇` | Shown only for emoji and hybrid |
| `colorMode` | `mono` \| `grayscale` \| `color` \| `ansi16` \| `duotone` | `color` | UI labels: Monochrome, Grayscale, Full Color, ANSI 16, Duotone |
| `monoColor` | hex | `#00ff9f` | Shown only for mono. Color picker plus hex text input. |
| `duotoneColor1` | hex | `#00ff9f` | "Dark Color", shown only for duotone |
| `duotoneColor2` | hex | `#ff00ff` | "Light Color", shown only for duotone |
| `brightness` | -100 to 100, step 5 | 0 | |
| `contrast` | -100 to 100, step 5 | 15 | |
| `saturation` | 0–200 %, step 10 | 100 | |
| `gamma` | 0.5–2.5, step 0.1 | 1.0 | |
| `invert` | bool | false | |
| `flipH` / `flipV` | bool | false | |
| `edgeDetection` | bool | false | |
| `edgeIntensity` | 0–100 %, step 10 | 50 | Shown only when edge detection is on |
| `dithering` | `none` \| `floydSteinberg` \| `ordered` | `none` | **Defined but not implemented and has no UI** (see 9) |

**Charset presets** (in order from the brightest to the darkest character):
- Classic: `" .:-=+*#%@"`
- Dense: `` " '`^",;:Il!i><~+_-?][}{1)(|\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$" ``
- Minimal: `" .-=#"`
- Blocks: `" ░▒▓█"`

**Emoji presets:**
- Faces: `😀😃😄😁😆😅🤣😂🙂🙃😐😶`
- Geometric: `⬛⬜🟥🟧🟨🟩🟦🟪🟫`
- Nature: `🌿🍃🌲🌳🌴🌱🍀☘️`
- Hearts: `❤️🧡💛💚💙💜🖤🤍🤎`

**Controls UI:** three tabs.
- **Style:** art style, density, charset, emoji set.
- **Color:** color mode and its color pickers.
- **Effects:** Auto Adjust (only when an image is loaded), brightness, contrast, saturation, gamma, Invert, Flip H, Flip V, Edge Detection and Edge Intensity.

A **Reset** button restores the defaults. Every slider shows its current value next to the label.

### 4.3 Conversion pipeline (core logic)

Conversion runs **100 ms after the last change** (debounced) to the image or settings, inside `requestAnimationFrame`.

1. **Grid size.** `cols = density`, `rows = floor(cols × (imgH / imgW) × 0.5)`. The 0.5 factor allows for characters being about twice as tall as they are wide.
2. **Downsample.** Draw the image onto an offscreen canvas of `cols × rows`, so one canvas pixel becomes one character. Flips use canvas `translate` and `scale(-1)` before drawing.
3. **Edge detection (optional).** Apply a 3×3 Sobel operator to the grayscale image. Magnitude = `min(255, √(gx²+gy²))`. Blend it with the original per channel: `out = orig × (1 − k) + edge × k`, where `k = edgeIntensity / 100`.
4. **Per-pixel tone adjustment**, applied to each RGB channel in this order:
   - Gamma: `v = (v/255)^gamma × 255`
   - Brightness: `v += brightness × 2.55`
   - Contrast: `v = ((v/255 − 0.5) × (100 + contrast)/100 + 0.5) × 255`
   - Clamp to 0–255
5. **Saturation.** `gray = 0.299R + 0.587G + 0.114B`, then `c = clamp(gray + (c − gray) × saturation/100)`.
6. **Invert (optional).** `c = 255 − c`.
7. **Luminance.** `L = 0.299R + 0.587G + 0.114B` (Rec. 601).
8. **Character selection by style.** Index into a ramp with `i = floor((1 − L/255) × (n − 1))`, clamped. Bright pixels map to the start of the ramp (the space).
   - `ascii`, `colorAscii`: ramp = `charset`
   - `block`: ramp = `" ░▒▓█"` (fixed, ignores charset)
   - `emoji`: ramp = `emojiSet` split into code points, falling back to the geometric set if empty
   - `hybrid`: emoji ramp if `L < 128`, otherwise charset ramp
9. **Color selection by colorMode.**
   - `mono`: `monoColor`
   - `grayscale`: `rgb(L, L, L)`
   - `color`: the adjusted `rgb(R, G, B)`
   - `ansi16`: nearest (Euclidean RGB distance) of the 16 standard ANSI colors (`#000000 #800000 #008000 #808000 #000080 #800080 #008080 #c0c0c0 #808080 #ff0000 #00ff00 #ffff00 #0000ff #ff00ff #00ffff #ffffff`)
   - `duotone`: linear interpolation from `duotoneColor1` to `duotoneColor2` with `t = L/255`
   - Emoji cells are not colored. They keep their native glyph colors.
10. **Output.** Produce:
    - `text`: plain characters, with `\n` per row
    - `html`: a `<pre>` (JetBrains Mono, 10px, line-height 1) of `<span style="color:…">` per cell, with `<br/>` per row and spaces as `&nbsp;`
    - `width = cols`, `height = rows`

Note: `ascii` and `colorAscii` behave the same in the pipeline. Both are colored by `colorMode`. Their only difference is the default pairing used in the UI and presets.

### 4.4 Auto Adjust

When clicked, it analyzes the image downscaled to 200 px wide:
- Build a 256-bin luminance histogram and compute the mean.
- Find the effective min and max, ignoring the darkest and brightest 1% of pixels.
- `brightness = round((128 − (min+max)/2) / 255 × 100)`, clamped to ±50.
- `contrast = round((220 / max(range, 1) − 1) × 50)`, clamped to −30…60.
- `gamma`: if the normalized mean is below 0.4, use `0.7 + mean × 0.5`. If it is above 0.6, use `1 + (mean − 0.6) × 1.5`. Otherwise 1.0. Clamp to 0.5–2.0 and round to 0.1.
- Only brightness, contrast and gamma are changed.

### 4.5 Preview

- A terminal-style window with three dots, the title `ascii9_preview.term` and a Clear button.
- Toolbar: zoom out and zoom in (±25%, range 25–300%), the current zoom %, a "fit to screen" button (caps at 150%), and the output size "W × H chars".
- Fits automatically when the output changes. The fit assumes about 6 px per character and is capped at 100%.
- The rendered HTML is shown at an 8px base font size and scaled with CSS `transform`. The text is selectable (`select-all`).
- States: a spinner while processing; "AWAITING INPUT…" / "Upload an image to generate ASCII art" when there is no output.

### 4.6 Export

**Formats:** PNG, JPG, SVG, TXT, HTML, Markdown. The file name is `ascii9-YYYY-MM-DD.<ext>`. A toast "Downloaded <file>" confirms each download.

| Format | Behavior |
|---|---|
| TXT | `output.text` |
| Markdown | `output.text` wrapped in a fenced code block |
| HTML | A standalone page with the background color applied and `output.html` centered with flexbox |
| SVG | A `<foreignObject>` that embeds `output.html`, sized `width×8` by `height×12`, over a background rect |
| PNG/JPG | Canvas render. Font: JetBrains Mono, `10 × scale` px (scale = 2), line height 1.1 × font size, char width 0.6 × font size, padding 20 × scale. Each non-space cell is drawn with its color. JPG quality is 0.95. |

**Platform size presets** (affect PNG/JPG only; they set a minimum canvas size before scaling):
Twitter/X 400×400, Discord 128×128, GitHub 460×460, LinkedIn 400×400, Instagram 320×320, Custom 512×512 (default).

**Background color** used by the export panel: `#fafaf8` (light).

**Export UI:**
- **Desktop** (a bar under the preview): platform dropdown (shows sizes), spacer, format dropdown (default PNG), a **Download** button, and a **Share** button (placeholder, does nothing).
- **Mobile** (sticky footer bar): a ⚙ button that opens the controls drawer, and a **Download ▾** dropdown. Picking a format downloads it immediately. The same menu has a "Platform Size" section with a checkmark on the selected size.
- A Copy-to-clipboard feature was removed on purpose ("Download is enough").

### 4.7 Preset gallery (`/gallery`)

- Search (matches name or description, case-insensitive) and category filter chips: All, Retro Terminal, Neon Glow, Pixel Art, Emoji Mosaic, Sketch.
- A results count ("N presets found") and an empty state ("No presets found").
- Responsive grid with 1, 2, 3 or 4 columns. Each card shows:
  - a hard-coded ASCII preview with CRT scanlines
  - the name and a category badge
  - the description
  - tags for style, colorMode and "edges"
- Clicking a card navigates to `/` with the preset's full settings in router state. The home page applies them and shows the toast "Preset applied! Upload an image to see the effect."

**Preset catalog** (settings not listed use the defaults):

| ID | Name | Category | style | density | colorMode | charset | Other |
|---|---|---|---|---|---|---|---|
| classic-green | Classic Green | retro | ascii | 80 | mono `#00ff9f` | Classic | contrast 10 |
| amber-crt | Amber CRT | retro | ascii | 60 | mono `#ffb000` | `" .:+=*&%$#@"` | brightness 5, contrast 15 |
| cyberpunk-duo | Cyberpunk Duo | neon | colorAscii | 100 | duotone `#ff00ff`→`#00ff9f` | Blocks | contrast 20 |
| sunset-glow | Sunset Glow | neon | colorAscii | 80 | duotone `#ff6b35`→`#ff006e` | Classic | brightness 10, contrast 15 |
| pixel-blocks | Pixel Blocks | pixel | block | 60 | color | — | contrast 25 |
| grayscale-blocks | Grayscale Blocks | pixel | block | 80 | grayscale | — | brightness 5, contrast 20 |
| emoji-faces | Emoji Faces | emoji | emoji | 40 | color | — | Faces set, contrast 10 |
| emoji-geometric | Geometric Emoji | emoji | emoji | 50 | color | — | Geometric set, contrast 15 |
| edge-sketch | Edge Sketch | sketch | ascii | 100 | mono `#e0e0e0` | Classic | contrast 30, invert, edges |
| neon-edge | Neon Edge | sketch | colorAscii | 90 | duotone `#00ffff`→`#ff00ff` | Blocks | brightness −10, contrast 40, edges |

(Check `src/data/examplePresets.ts` in the old repo for the exact saturation, gamma and edgeIntensity values before porting.)

---

## 5. Layout and responsive behavior

**Desktop (≥ 768 px):**
- A collapsible left controls panel (320 px, animated) with a "CONTROLS" header and Reset. A chevron tab on its edge toggles it.
- The main area holds the preview window, with the export bar below it once an image is loaded.

**Mobile (< 768 px):**
- No sidebar. Controls open in a bottom drawer (up to 85% of the viewport height) titled "CONTROLS", with a close button.
- After an image is loaded, a sticky bottom bar holds ⚙ (opens controls) and Download.

---

## 6. Visual design (current direction)

- A retro-terminal / cyberpunk theme: a terminal-window frame, glow shadows, CRT scanlines, a matrix grid background, chromatic text for headings, corner brackets on the upload zone, and blurred color orbs in the background.
- Fonts: **VT323** / Press Start 2P (display), **Space Grotesk** (body), **JetBrains Mono** (art and code).
- The current theme is light (background `hsl(60 10% 98%)`, primary green `hsl(150 100% 32%)`, secondary cyan, tertiary lime). A `.dark` theme is defined in CSS but there is no switch for it.
- Motion: subtle Framer Motion entrance and hover animations.

---

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Privacy | No network calls involve user images. All processing stays on the client. |
| Performance | The preview should update within ~150 ms of a settings change at density ≤ 120 on a mid-range laptop. The UI must stay responsive at density 200. |
| Compatibility | The latest two versions of Chrome, Safari, Firefox and Edge, including iOS Safari and Android Chrome. |
| Accessibility | All controls work with a keyboard and have labels. Contrast meets WCAG AA. |
| Hosting | Static hosting with no backend (Vercel, Netlify, GitHub Pages). |
| SEO/Share | Title "ASCII9 - Image to ASCII Art Converter", plus a meta description and OG/Twitter tags. The demo currently uses Lovable's default OG image, which should be replaced. |

---

## 8. Tech stack in the demo (for reference, not a requirement)

React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui (Radix), Framer Motion, react-router, sonner (toasts). There is no backend and no meaningful tests.

---

## 9. Known defects and gaps in the demo (fix in the rebuild)

1. **No HTML escaping.** Characters are inserted into the `<span>`s raw. The **Dense** charset contains `<`, `>`, `&` and `"`, and the Amber charset contains `&`. These corrupt the preview HTML and the PNG export. The rebuild should escape characters, or better, render from a structured cell grid instead of an HTML string.
2. **PNG export re-parses the HTML with a regex** to recover colors. The rebuild should keep a structured `cells[row][col] = {char, color}` model and derive every output format from it.
3. **Emoji splitting is wrong** for sequences with variation selectors or joiners (❤️, ☘️). Splitting by code point breaks them into separate pieces. The rebuild should split with `Intl.Segmenter` (grapheme clusters).
4. **Emoji cell width:** emoji are about twice as wide as monospace characters, so emoji output is stretched horizontally. Image export also uses a monospace advance width for emoji. The aspect ratio needs correcting for emoji styles.
5. **Emoji cells have no color in exports.** PNG export falls back to `#00ff9f`.
6. **Platform size presets don't produce that size.** The canvas is `max(platform, content)` and is never scaled to fit, so a "Discord 128×128" export can be thousands of pixels wide.
7. **Export background is hard-coded** to light `#fafaf8`. Light presets (e.g. Edge Sketch `#e0e0e0`, Grayscale) become nearly invisible. Add a background color option, or derive it from the theme or preset.
8. **SVG export uses `<foreignObject>`.** Many viewers and editors (Figma, Illustrator, image previewers) don't render it, and the 8×12 sizing is a guess. Use real `<text>`/`<tspan>` elements instead.
9. **The Share button does nothing.** Implement it (Web Share API with the PNG file) or remove it.
10. **Dithering** (`floydSteinberg`, `ordered`) exists in the type but is not implemented and has no UI.
11. **Paste only works before an image is loaded.** The paste listener lives in the upload zone, which unmounts once an image is loaded, even though the header always says "Ctrl+V to paste". The listener should be global.
12. **Performance:** conversion runs on the main thread and builds strings by concatenation. The rebuild should use a Web Worker / `OffscreenCanvas` and render the preview to a canvas, or use one span per color run instead of one per character.
13. **Preview flicker:** the spinner replaces the preview on every recompute. Keep the previous output visible while recomputing.
14. **Preset hand-off uses router history state.** It is lost on refresh and can't be shared. Use URL query params (or a hash) to encode settings, which also makes settings shareable.
15. **Gallery previews are hard-coded ASCII art**, not real renders. Render each preset from a sample image instead.
16. **Edge detection leaves a black 1-pixel border**, because border pixels are not computed. Handle edges by clamping.
17. **Hybrid threshold is fixed** at L < 128.
18. **`ascii` vs `colorAscii`** have no behavioral difference. Merge them, or make `ascii` force mono.
19. **There is no theme toggle**, even though dark theme tokens exist.
20. **Upload zone "IMAGE LOADED" state is never shown.** The zone is only visible when there is no image.

---

## 10. Suggested enhancements (optional for v1 of the rebuild)

- Copy as text or rich HTML (removed in the demo; reconsider for developer users).
- Settings persisted in `localStorage`, plus shareable settings URLs.
- User-saved custom presets.
- Background color and font-size options for exports.
- Before/after comparison (original image overlay or split view).
- Webcam capture as an input source.
- ANSI escape-code export (`.ans` / shell script) for terminals.
- Implement dithering.

---

## 11. Acceptance criteria (v1)

- [ ] An image can be loaded by drag-drop, file picker, clipboard paste (at any time) and sample thumbnails. Invalid and oversized files are rejected with a message.
- [ ] Every setting in 4.2 is present, changes the preview live, and follows the pipeline in 4.3 (or a documented improvement on it).
- [ ] Auto Adjust, Reset and Clear behave as in 4.4 and 4.1.
- [ ] All 10 presets are available in the gallery with search and filtering, and applying one updates the converter.
- [ ] All six export formats download correctly. Characters such as `< > & "` do not break any output. Platform sizes produce images of that size.
- [ ] Desktop and mobile layouts match section 5.
- [ ] No image data leaves the browser (verified in the network panel).
