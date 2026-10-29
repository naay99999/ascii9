export interface Player {
  /** Resolves once the first frame can be drawn; rejects if the browser can't play the clip. */
  ready: Promise<void>
  readonly playing: boolean
  readonly time: number
  readonly duration: number
  muted: boolean
  play(): Promise<void>
  pause(): void
  seek(t: number): void
  step(dir: -1 | 1): void
  dispose(): void
  /** Play/pause, mute and time changes (time at most ~4 times a second). */
  onstate?: () => void
}

export interface PlayerOptions {
  onFrame: (bitmap: ImageBitmap, time: number) => void
  /** Asked before each playing frame: false drops the frame instead of queueing it. */
  canTakeFrame: () => boolean
  fps: number
}

/** Minimum gap between time-only onstate calls. */
const TIME_STATE_MS = 250

type FrameVideo = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number
  cancelVideoFrameCallback?: (handle: number) => void
}

/** Plays the clip in a hidden <video> and hands frames to the converter. While playing, a frame is
 * grabbed only when the converter can take it, so the preview runs at the converter's pace instead
 * of falling behind. After a seek, step or pause the frame at the new position is always delivered,
 * so a still preview is never stale. */
export function createPlayer(file: Blob, opts: PlayerOptions): Player {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video') as FrameVideo
  video.muted = true
  video.loop = true
  video.playsInline = true
  video.setAttribute('playsinline', '')
  video.preload = 'auto'
  // In the document but invisible: some browsers stop presenting frames for detached or
  // display:none videos, which would starve requestVideoFrameCallback.
  Object.assign(video.style, {
    position: 'fixed',
    left: '0',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
  })
  video.src = url
  document.body?.appendChild(video)

  let disposed = false
  /** A playing-frame grab is under way; another one would just queue up behind it. */
  let grabbing = false
  let frameHandle: number | null = null
  let rafHandle: number | null = null
  let lastRafTime = -1
  let lastTimeState = 0
  const hasRvfc = typeof video.requestVideoFrameCallback === 'function'
  /** Assigned once built below; only read from event callbacks, which come later. */
  let player: Player

  function emit(): void {
    if (!disposed) player.onstate?.()
  }

  function grab(force: boolean): void {
    if (disposed) return
    if (!force && (grabbing || !opts.canTakeFrame())) return
    const time = video.currentTime
    grabbing = true
    createImageBitmap(video).then(
      (bitmap) => {
        grabbing = false
        if (disposed) bitmap.close()
        else opts.onFrame(bitmap, time)
      },
      () => {
        // The element had no frame to give (e.g. mid-load); the next callback tries again.
        grabbing = false
      },
    )
  }

  function onVideoFrame(): void {
    frameHandle = null
    if (disposed) return
    if (!video.paused) grab(false)
    watchFrames()
  }

  function onAnimationFrame(): void {
    rafHandle = null
    if (disposed || video.paused) return
    if (video.currentTime !== lastRafTime) {
      lastRafTime = video.currentTime
      grab(false)
    }
    rafHandle = requestAnimationFrame(onAnimationFrame)
  }

  /** Keeps a frame callback registered while the clip plays. */
  function watchFrames(): void {
    if (disposed) return
    if (hasRvfc) {
      if (frameHandle === null) frameHandle = video.requestVideoFrameCallback!(onVideoFrame)
    } else if (rafHandle === null && !video.paused) {
      rafHandle = requestAnimationFrame(onAnimationFrame)
    }
  }

  const listeners: Record<string, () => void> = {
    play: () => {
      watchFrames()
      emit()
    },
    pause: emit,
    volumechange: emit,
    seeked: () => {
      grab(true)
      emit()
    },
    timeupdate: () => {
      // Fallback path: keep frames coming even if rAF was throttled.
      if (!hasRvfc && !video.paused) grab(false)
      const now = Date.now()
      if (now - lastTimeState < TIME_STATE_MS) return
      lastTimeState = now
      emit()
    },
  }
  for (const [type, fn] of Object.entries(listeners)) video.addEventListener(type, fn)

  let settleReady: { resolve: () => void; reject: (e: Error) => void } | null = null
  const ready = new Promise<void>((resolve, reject) => {
    settleReady = { resolve, reject }
  })
  // Callers may never await ready (e.g. disposed early); don't surface that as unhandled.
  ready.catch(() => {})
  const onLoaded = () => {
    settleReady?.resolve()
    settleReady = null
    grab(true)
    emit()
  }
  const onError = () => {
    settleReady?.reject(new Error("Couldn't play that video."))
    settleReady = null
  }
  video.addEventListener('loadeddata', onLoaded)
  video.addEventListener('error', onError)
  watchFrames()

  const duration = () => (Number.isFinite(video.duration) ? video.duration : 0)
  function clampTime(t: number): number {
    const d = duration()
    return Math.max(0, d > 0 ? Math.min(t, d) : t)
  }

  player = {
    ready,
    get playing() {
      return !disposed && !video.paused
    },
    get time() {
      return video.currentTime
    },
    get duration() {
      return duration()
    },
    get muted() {
      return video.muted
    },
    set muted(m: boolean) {
      // The element's volumechange event reports the change through onstate.
      video.muted = m
    },
    async play(): Promise<void> {
      if (disposed) return
      await video.play()
    },
    pause(): void {
      if (disposed) return
      video.pause()
      grab(true)
    },
    seek(t: number): void {
      if (disposed) return
      video.currentTime = clampTime(t)
    },
    step(dir: -1 | 1): void {
      if (disposed) return
      video.pause()
      video.currentTime = clampTime(video.currentTime + dir / opts.fps)
    },
    dispose(): void {
      if (disposed) return
      disposed = true
      if (frameHandle !== null) video.cancelVideoFrameCallback?.(frameHandle)
      if (rafHandle !== null) cancelAnimationFrame(rafHandle)
      frameHandle = rafHandle = null
      for (const [type, fn] of Object.entries(listeners)) video.removeEventListener(type, fn)
      video.removeEventListener('loadeddata', onLoaded)
      video.removeEventListener('error', onError)
      settleReady?.reject(new Error('disposed'))
      settleReady = null
      video.pause()
      // Dropping the source releases the decoder before the element is garbage-collected.
      video.removeAttribute('src')
      video.load()
      video.remove()
      URL.revokeObjectURL(url)
      player.onstate = undefined
    },
  }

  return player
}
