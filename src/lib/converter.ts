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

export function createConverter(
  worker: WorkerLike,
  onGrid: (g: Grid, plan: GridPlan) => void,
  delayMs = 60,
) {
  let nextId = 0
  let lastDelivered = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const pendingAuto = new Map<number, { resolve: (r: AutoResult) => void; reject: (e: Error) => void }>()

  worker.onmessage = (e) => {
    const msg = e.data
    if (msg.type === 'grid') {
      if (msg.id < lastDelivered) return
      lastDelivered = msg.id
      onGrid(msg.grid, msg.plan)
    } else if (msg.type === 'auto') {
      pendingAuto.get(msg.id)?.resolve(msg.result)
      pendingAuto.delete(msg.id)
    } else if (msg.type === 'error') {
      const p = pendingAuto.get(msg.id)
      if (p) {
        pendingAuto.delete(msg.id)
        p.reject(new Error(msg.message))
      }
      // convert errors: keep the previous render on screen
    }
  }

  return {
    setImage(bitmap: ImageBitmap): void {
      worker.postMessage({ type: 'image', bitmap }, [bitmap])
    },
    request(settings: Settings, cellAspect: number): void {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        worker.postMessage({ type: 'convert', id: ++nextId, settings, cellAspect })
      }, delayMs)
    },
    autoAdjust(): Promise<AutoResult> {
      return new Promise((resolve, reject) => {
        const id = ++nextId
        pendingAuto.set(id, { resolve, reject })
        worker.postMessage({ type: 'auto', id })
      })
    },
    dispose(): void {
      if (timer !== null) clearTimeout(timer)
      timer = null
      for (const p of pendingAuto.values()) p.reject(new Error('disposed'))
      pendingAuto.clear()
      worker.onmessage = null
    },
  }
}
