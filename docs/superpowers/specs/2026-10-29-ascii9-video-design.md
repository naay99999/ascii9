# ASCII9 video: design

| | |
|---|---|
| Date | 2026-10-29 |
| Status | Draft for review |
| Builds on | `docs/superpowers/specs/2026-10-21-ascii9-mvp-design.md` (the MVP spec). Everything there still holds unless this document says otherwise. |

## 1. Intent

The MVP is finished and working. The owner now wants ASCII9 to take a **video** as well as a photo, turn it into ASCII art, and let people **download a real video file they can post**.

Where the files go, in the owner's words: mainly IG, TikTok and FB.

**What success looks like**
- Someone drops a phone clip, sees it playing as ASCII straight away, tweaks the look while it plays, and downloads an MP4 that uploads to IG/TikTok/FB without complaint, with the original sound.
- The image flow stays exactly as it is today.

## 2. Goals, non-goals, anti-goals

**Goals**
- Accept a video file wherever an image is accepted today (file picker and drag-and-drop).
- Live preview: the video plays as ASCII on the stage, looping, and responds to setting changes while it plays.
- Pause and scrub: pause on one frame, drag a timeline, step frame by frame.
- Download dialog for video: choose format and whether to keep the original sound.
- Everything stays in the browser. No video data leaves the device.

**Non-goals (this round)**
- Trimming, cutting, speed changes, or editing the timeline.
- Animated GIF *input* (a GIF still uses its first frame, as in the MVP).
- Sample videos in the sample strip.
- Text (TXT) export of a video.
- Adding music or any audio other than the clip's own.
- Pasting a video from the clipboard (browsers rarely put video files there; paste stays image-only).

**Anti-goals**
- Uploading video to a server, or a heavy in-browser toolchain (such as ffmpeg.wasm, tens of MB) that makes the page slow to load for people who only convert photos.
- An MP4 that IG/TikTok/FB reject or play without sound when sound was asked for.
- The preview stuttering so badly that the look can't be judged, or the slider UI freezing while video plays.
- Any regression in the photo flow.
- All MVP anti-goals still apply (look, overwhelming controls, hard-to-follow code).

## 3. Constraints

- Static hosting only, no server code (unchanged).
- Same browser targets as the MVP. Where a browser can't encode video, the app must say so plainly instead of failing silently (see 4.6).
- Privacy: no network request carries image or video data (unchanged).
- Keep dependencies minimal. Any added library must be small, tree-shakeable, loaded only when video is used, and justified in the plan.

## 4. Decisions

Marked **(owner)** = the owner decided. **(Claude)** = Claude's call; the owner heard it and didn't object, but may still change it.

### 4.1 Input (Claude)
- The file picker accepts `image/*,video/*`. Drop accepts a video file too. The top-bar hint changes to mention video.
- Video limits: up to **200 MB** and **60 seconds** on desktop, **30 seconds** on phones (**owner**: phone browsers, iOS Safari especially, may run out of memory exporting a long 1080 × 1920 clip). Over either: a short inline message, as with images. The image limit stays 10 MB.
- A video replaces whatever is on the stage; a photo replaces a video. Settings are kept, as today.
- If the browser can't decode the file (e.g. an unusual codec), show "Couldn't read that video." and keep the previous art.

### 4.2 Live preview (owner)
- The video plays on the stage as ASCII, **looping**, as soon as it is loaded.
- Changing any setting while it plays updates the art on the next frames, without stopping playback.
- When the converter can't keep up, frames are **dropped**, never queued: the preview shows the newest frame it can. (This matches the MVP converter's "only the latest request" behaviour.)
- **Preview smoothness (owner):** a somewhat choppy preview (around 7 fps at high Detail, with the current engine and `drawGrid`) is acceptable, as long as the look can be judged and the controls stay responsive. No new renderer is needed for this round. The exported file is full frame rate regardless.
- Preview sound is **muted by default** with a toggle to unmute **(Claude)**.

### 4.3 Transport controls (owner, from mockup A)
Below the stage when a video is loaded (hidden for photos):
- Play / pause.
- A timeline scrubber that shows position and can be dragged.
- Step back / step forward one frame (while paused).
- Current time / duration readout.
- Mute toggle (4.2).
- Keyboard: Space toggles play, Left/Right step a frame when paused **(Claude)**. Controls are labelled and keyboard-operable (MVP constraint).

On mobile the controls sit under the stage above the dock, with 44 px touch targets.

### 4.4 Download dialog (owner, from mockup B)
For a video, **Download** opens a small dialog instead of saving straight away. (Photos keep today's button and format menu.)

- **Format:** MP4 (default), WebM, GIF, PNG of the current frame.
- **Sound:** "Include original sound", on by default. Disabled with a note when the clip has no audio track, and for GIF/PNG.
- **Size (Claude, changes mockup B):** the mockup showed a separate size choice ("as original" / "1080 vertical"). The existing **Frame** setting already does this (9:16 = 1080 × 1920 for Reels/TikTok), so the dialog shows the size the Frame gives, read-only, instead of a second control that could disagree with it. *Flagged for the owner.*
- A **Start** button, then a progress bar with percentage and a **Cancel** button. The dialog says that closing the tab stops the export.
- Export time of roughly a minute for a 60 s clip is acceptable **(owner)**.
- When done the file downloads (`ascii9-YYYY-MM-DD.mp4` etc.) and the dialog shows the quiet "Saved" note.
- **On phones (owner):** when the export finishes, the system share sheet opens (`navigator.share({ files })`) so the user can tap "Save Video" and get it into Photos, where the IG/TikTok/FB apps pick from. This lifts the MVP's "no Share button" non-goal for video exports only. Where file sharing isn't supported, fall back to a normal download. The share call needs a user gesture, so after a long export the dialog shows a **Save to Photos** button rather than calling share automatically **(Claude)**.

### 4.5 Output (Claude)
- **MP4:** H.264 video, AAC audio, so IG/TikTok/FB accept it. Frame rate follows the source, capped at **30 fps**.
- **Pixel size:** from the Frame setting, using the MVP table, except **Original** caps the long edge at **1920 px** (and 16:9 exports at 1920 × 1080 instead of 2560 × 1440) to stay within common H.264 limits and keep files postable. Dimensions are rounded to even numbers.
- **Sound:** pass the original audio through without re-encoding when the container allows it; otherwise re-encode to AAC. If AAC can't be produced in this browser, MP4 with sound is unavailable here and the dialog says so (MP4 without sound and WebM stay available).
- **WebM:** VP9 (or VP8) video, Opus audio.
- **GIF:** no sound, capped at **15 fps** and **720 px** long edge, because GIFs get huge. The dialog warns when the clip is long.
- **PNG of the current frame:** exactly the MVP PNG export of what's on screen.
- The export renders **every frame** from the start of the clip (not the dropped-frame preview), with the settings as they were when Start was pressed. Settings changes during export don't affect it.

### 4.6 How it's built (Claude)
- **WebCodecs** (`VideoDecoder`/`VideoEncoder`/`AudioEncoder`) for decode and encode, plus one small demux/mux library loaded **lazily** the first time a video is used. Candidate: Mediabunny (successor of `mp4-muxer`/`webm-muxer`). The plan must confirm its size and licence before adding it. No ffmpeg.wasm.
- The existing conversion engine (`src/engine`) is reused unchanged: each video frame becomes the same `ImageData → convert() → Grid` it is for a photo, and each output frame is drawn with the existing `drawGrid`.
- Preview uses a hidden `<video>` element as the clock and frame source (`requestVideoFrameCallback` where available), handing frames to the existing worker/converter.
- Export runs off the main thread where the browser allows, so the dialog's progress and Cancel stay responsive.
- **Decode rule (Claude): if the browser can play the clip, it can export it.** Export decodes with WebCodecs `VideoDecoder` when it supports the clip's codec. Otherwise it falls back to stepping the hidden `<video>` element frame by frame (slower but works for anything the browser plays, e.g. iPhone HEVC in a browser whose WebCodecs lacks HEVC). A clip the browser can't play at all gets "Couldn't read that video." on load.
- **GIF (Claude):** a second small GIF encoder library is allowed (e.g. `gifenc`, a few KB), loaded lazily like the first. GIF doesn't need WebCodecs encoding, so it stays available where video encoding isn't.
- **Feature check:** if WebCodecs encoding isn't available, video still loads and previews, but the dialog offers only GIF and "PNG of the current frame" and explains that MP4/WebM export needs a newer browser.

## 5. Left to the builder
- Component structure, the worker message protocol for frames, and whether preview and export share one worker.
- Exact UI copy (English, matching the MVP tone), spacing and the look of the transport bar and dialog, within MVP 4.2.
- Bitrates and encoder settings, as long as output plays and uploads cleanly on IG/TikTok/FB.
- How the mute toggle and transport look on mobile, within MVP 4.8.
- Test scope. At minimum: input validation for video (type, size, duration), output size rules (even dimensions, caps), frame-rate capping, and that exported frame count matches duration × fps.

## 6. Acceptance
- [ ] A phone MP4/MOV under the limits plays as looping ASCII on the stage within a couple of seconds of dropping it. Over-limit or unreadable files show a message.
- [ ] Changing look, detail, colour and frame while it plays updates the art without stopping playback or freezing the controls.
- [ ] Pause, scrub, frame-step, time readout and mute all work, by mouse, touch and keyboard.
- [ ] Downloaded MP4 (with sound) plays in QuickTime/Photos and in the IG, TikTok and FB upload flows, with the original sound in sync, at the Frame's pixel size.
- [ ] On an iPhone, a 30 s clip exports and "Save to Photos" puts the MP4 in Photos, from where it can be picked in the IG app.
- [ ] Sound off produces a silent MP4. WebM, GIF and PNG-of-frame export work. Cancel stops an export.
- [ ] Browsers without encoding support get the explanatory message, not an error.
- [ ] The photo flow and its tests are unchanged and pass. The page's initial load doesn't grow by the video library (it loads only when a video is used).
- [ ] The network panel shows no video data leaving the browser.
