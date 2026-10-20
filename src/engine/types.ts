export type Style = 'ascii' | 'blocks'
export type ColorMode = 'mono' | 'image' | 'duotone'
export type Frame = 'original' | '1:1' | '4:5' | '9:16' | '16:9'
export type PresetId = 'original' | 'terminal' | 'amber' | 'blocks' | 'sketch' | 'neon'

export interface LookSettings {
  style: Style
  colorMode: ColorMode
  monoColor: string
  duo1: string
  duo2: string
  charset: string
  brightness: number
  contrast: number
  gamma: number
  saturation: number
  invert: boolean
  edges: boolean
  edgeIntensity: number
}

export interface LayoutSettings {
  detail: number
  frame: Frame
  fit: 'fill' | 'fit'
  flipH: boolean
}

export interface Settings {
  look: LookSettings
  layout: LayoutSettings
}

/** Cell grid produced by the engine. `glyphs` is the ramp; a space glyph is ' ' (do not assume index 0 is a space); `index` is one
 * entry per cell, row-major; `rgb` holds 3 bytes per cell. */
export interface Grid {
  cols: number
  rows: number
  glyphs: string[]
  index: Uint16Array
  rgb: Uint8Array
}
