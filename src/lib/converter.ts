import type { Grid, Settings } from '../engine/types'
import type { GridPlan } from '../engine/layout'

export interface AutoResult {
  brightness: number
  contrast: number
  gamma: number
}

export type ToWorker =
  | { type: 'image'; bitmap: ImageBitmap }
  | { type: 'convert'; id: number; settings: Settings; cellAspect: number }
  | { type: 'auto'; id: number }

export type FromWorker =
  | { type: 'grid'; id: number; grid: Grid; plan: GridPlan }
  | { type: 'auto'; id: number; result: AutoResult }
  | { type: 'error'; id: number; message: string }

export interface WorkerLike {
  postMessage(m: ToWorker, transfer?: Transferable[]): void
  onmessage: ((e: { data: FromWorker }) => void) | null
}

/** What a convert request was made with, handed back with its grid (or its error). `image` counts
 * setImage calls, so a reply can be tied to the image it was made for. */
export interface Used {
  settings: Settings
  cellAspect: number
  image: number
}

export interface ConverterOptions {
  /** A convert request failed in the worker. Not called for stale replies or autoAdjust errors. */
  onError?: (message: string, used: Used) => void
  /** Image numbers start after this (default 0), so a replacement converter keeps counting. */
  imageBase?: number
}

/** Convert requests run one at a time. The first request goes out on the next tick (a synchronous
 * burst becomes one post); while a job is in flight only the LATEST settings are kept, and they are
 * posted as soon as that job replies (grid or error). A continuous slider drag therefore updates the
 * preview at the speed of the worker instead of waiting for the pointer to pause. */
export function createConverter(
  worker: WorkerLike,
  onGrid: (g: Grid, plan: GridPlan, used: Used) => void,
  options: ConverterOptions = {},
) {
  let nextId = 0
  let lastDelivered = 0
  let image = options.imageBase ?? 0
  let disposed = false
  let timer: ReturnType<typeof setTimeout> | null = null
  /** Id of the convert the worker is working on, if any. */
  let inFlight: number | null = null
  /** The newest request not yet posted. */
  let queued: Omit<Used, 'image'> | null = null
  // Per-request record of the inputs, so a reply can be described by what produced it
  // rather than by whatever the settings are when it arrives.
  const sent = new Map<number, Used>()
  const pendingAuto = new Map<number, { resolve: (r: AutoResult) => void; reject: (e: Error) => void }>()

  function flush(): void {
    if (disposed || inFlight !== null || !queued) return
    // Tagged at post time: the worker converts with whichever image it holds when this arrives.
    const used: Used = { ...queued, image }
    queued = null
    const id = ++nextId
    sent.set(id, used)
    inFlight = id
    worker.postMessage({ type: 'convert', id, settings: used.settings, cellAspect: used.cellAspect })
  }

  /** The in-flight job answered: free the slot and send whatever was asked for meanwhile. */
  function settle(id: number): void {
    if (id !== inFlight) return
    inFlight = null
    flush()
  }

  worker.onmessage = (e) => {
    if (disposed) return
    const msg = e.data
    if (msg.type === 'grid') {
      settle(msg.id)
      if (msg.id <= lastDelivered) return
      const used = sent.get(msg.id)
      if (!used) return
      lastDelivered = msg.id
      for (const id of sent.keys()) if (id <= msg.id) sent.delete(id)
      onGrid(msg.grid, msg.plan, used)
    } else if (msg.type === 'auto') {
      pendingAuto.get(msg.id)?.resolve(msg.result)
      pendingAuto.delete(msg.id)
    } else if (msg.type === 'error') {
      const p = pendingAuto.get(msg.id)
      if (p) {
        pendingAuto.delete(msg.id)
        p.reject(new Error(msg.message))
        return
      }
      settle(msg.id)
      const used = sent.get(msg.id)
      sent.delete(msg.id)
      // A convert failed: the previous render stays on screen; the caller decides what to say.
      if (used && msg.id > lastDelivered) options.onError?.(msg.message, used)
    }
  }

  return {
    /** True when no convert is in flight, queued or waiting for its tick, so a new video frame can
     * go out without piling up behind older ones. Auto-adjust requests are not counted. */
    idle(): boolean {
      return inFlight === null && queued === null && timer === null
    },
    /** Hands the bitmap to the worker (transferred: it is detached afterwards). Returns the image
     * number later requests for it are tagged with (`Used.image`). */
    setImage(bitmap: ImageBitmap): number {
      image++
      worker.postMessage({ type: 'image', bitmap }, [bitmap])
      return image
    },
    request(settings: Settings, cellAspect: number): void {
      if (disposed) return
      queued = { settings: structuredClone(settings), cellAspect }
      if (inFlight === null && timer === null) {
        timer = setTimeout(() => {
          timer = null
          flush()
        }, 0)
      }
    },
    autoAdjust(): Promise<AutoResult> {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        pendingAuto.set(id, { resolve, reject })
        worker.postMessage({ type: 'auto', id })
      })
    },
    dispose(): void {
      disposed = true
      if (timer !== null) clearTimeout(timer)
      timer = null
      queued = null
      inFlight = null
      sent.clear()
      for (const p of pendingAuto.values()) p.reject(new Error('disposed'))
      pendingAuto.clear()
      worker.onmessage = null
    },
  }
}
