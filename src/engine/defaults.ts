import type { LookSettings, PresetId, Settings } from './types'

export const CHARSETS = {
  classic: ' .:-=+*#%@',
  // Verbatim from prd.md section 4.2
  dense: " '`^\",;:Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$",
  minimal: ' .-=#',
} as const

export const BLOCK_RAMP = ' ░▒▓█'

const DEFAULT_LOOK: LookSettings = {
  style: 'ascii',
  colorMode: 'mono',
  monoColor: '#f2f2f2',
  duo1: '#00ffff',
  duo2: '#ff00ff',
  charset: CHARSETS.classic,
  brightness: 0,
  contrast: 15,
  gamma: 1,
  saturation: 100,
  invert: false,
  edges: false,
  edgeIntensity: 50,
}

export const DEFAULT_SETTINGS: Settings = {
  look: DEFAULT_LOOK,
  layout: { detail: 80, frame: 'original', fit: 'fill', flipH: false },
}

const look = (o: Partial<LookSettings>): LookSettings => ({ ...DEFAULT_LOOK, ...o })

// Tuned by eye on the four bundled samples at Detail 80 (see the Task 10 report for the reasons).
export const PRESETS: Record<PresetId, { label: string; look: LookSettings }> = {
  original: { label: 'Original', look: look({}) },
  terminal: { label: 'Terminal', look: look({ monoColor: '#00ff9f', contrast: 20 }) },
  amber: { label: 'Amber', look: look({ monoColor: '#ffb000', charset: ' .:+=*&%$#@', contrast: 20 }) },
  blocks: { label: 'Blocks', look: look({ style: 'blocks', colorMode: 'image', contrast: 25, gamma: 0.8, saturation: 120 }) },
  sketch: {
    label: 'Sketch',
    look: look({ monoColor: '#e0e0e0', edges: true, edgeIntensity: 100, contrast: 30, brightness: -20 }),
  },
  neon: {
    label: 'Neon',
    look: look({
      colorMode: 'duotone',
      duo1: '#00ffff',
      duo2: '#ff00ff',
      edges: true,
      edgeIntensity: 80,
      contrast: 40,
      brightness: -10,
    }),
  },
}

const HEX_FIELDS = new Set<keyof LookSettings>(['monoColor', 'duo1', 'duo2'])

function sameLook(a: LookSettings, b: LookSettings): boolean {
  return (Object.keys(a) as (keyof LookSettings)[]).every((k) =>
    HEX_FIELDS.has(k)
      ? String(a[k]).toLowerCase() === String(b[k]).toLowerCase()
      : a[k] === b[k],
  )
}

export function matchPreset(l: LookSettings): PresetId | 'custom' {
  for (const id of Object.keys(PRESETS) as PresetId[]) {
    if (sameLook(l, PRESETS[id].look)) return id
  }
  return 'custom'
}

export function applyPreset(s: Settings, id: PresetId): Settings {
  return { ...s, look: { ...PRESETS[id].look } }
}
