import { DEFAULT_SETTINGS } from '../engine/defaults'
import type { ColorMode, Frame, Settings, Style } from '../engine/types'

export const STORAGE_KEY = 'ascii9:settings:v1'

const STYLES: readonly Style[] = ['ascii', 'blocks']
const COLOR_MODES: readonly ColorMode[] = ['mono', 'image', 'duotone']
const FRAMES: readonly Frame[] = ['original', '1:1', '4:5', '9:16', '16:9']
const FITS = ['fill', 'fit'] as const
const HEX = /^#[0-9a-f]{6}$/i

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

const num = (v: unknown, min: number, max: number, d: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d
const oneOf = <T extends string>(v: unknown, set: readonly T[], d: T): T =>
  typeof v === 'string' && (set as readonly string[]).includes(v) ? (v as T) : d
const hex = (v: unknown, d: string): string => (typeof v === 'string' && HEX.test(v) ? v : d)
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d)

export function defaultSettings(): Settings {
  return structuredClone(DEFAULT_SETTINGS)
}

/** Validate untrusted data into Settings, per-field falling back to defaults. */
export function sanitizeSettings(raw: unknown): Settings {
  const d = defaultSettings()
  if (!isObj(raw)) return d
  const l = isObj(raw.look) ? raw.look : {}
  const y = isObj(raw.layout) ? raw.layout : {}
  return {
    look: {
      style: oneOf(l.style, STYLES, d.look.style),
      colorMode: oneOf(l.colorMode, COLOR_MODES, d.look.colorMode),
      monoColor: hex(l.monoColor, d.look.monoColor),
      duo1: hex(l.duo1, d.look.duo1),
      duo2: hex(l.duo2, d.look.duo2),
      charset: str(l.charset, d.look.charset),
      brightness: num(l.brightness, -100, 100, d.look.brightness),
      contrast: num(l.contrast, -100, 100, d.look.contrast),
      gamma: num(l.gamma, 0.5, 2.5, d.look.gamma),
      saturation: num(l.saturation, 0, 200, d.look.saturation),
      invert: bool(l.invert, d.look.invert),
      edges: bool(l.edges, d.look.edges),
      edgeIntensity: num(l.edgeIntensity, 0, 100, d.look.edgeIntensity),
    },
    layout: {
      detail: num(y.detail, 20, 400, d.layout.detail),
      frame: oneOf(y.frame, FRAMES, d.layout.frame),
      fit: oneOf(y.fit, FITS, d.layout.fit),
      flipH: bool(y.flipH, d.layout.flipH),
    },
  }
}

export function loadSettings(storage: Pick<Storage, 'getItem'> | null): Settings {
  if (!storage) return defaultSettings()
  try {
    const text = storage.getItem(STORAGE_KEY)
    if (text == null) return defaultSettings()
    return sanitizeSettings(JSON.parse(text))
  } catch {
    return defaultSettings()
  }
}

export function saveSettings(storage: Pick<Storage, 'setItem'> | null, s: Settings): void {
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    /* quota / disabled storage */
  }
}

export function createDebouncedSaver(
  save: (s: Settings) => void,
  delayMs = 300,
): { schedule(s: Settings): void; flush(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Settings | undefined
  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    pending = undefined
  }
  return {
    schedule(s) {
      if (timer !== undefined) clearTimeout(timer)
      pending = s
      timer = setTimeout(() => {
        const p = pending
        timer = undefined
        pending = undefined
        if (p) save(p)
      }, delayMs)
    },
    flush() {
      const p = pending
      cancel()
      if (p) save(p)
    },
    cancel,
  }
}
