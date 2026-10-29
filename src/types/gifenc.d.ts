// gifenc ships no types; this covers only what the GIF export uses.
declare module 'gifenc' {
  export type Palette = number[][]

  export interface GifWriteOptions {
    palette?: Palette
    delay?: number
    repeat?: number
  }

  export interface GifEncoder {
    writeFrame(index: Uint8Array, width: number, height: number, opts?: GifWriteOptions): void
    finish(): void
    bytes(): Uint8Array
  }

  export function GIFEncoder(opts?: { initialCapacity?: number; auto?: boolean }): GifEncoder
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, maxColors: number, opts?: object): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: string): Uint8Array
}
