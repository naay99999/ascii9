export interface ExportSupport {
  /** H.264 at the export size. */
  mp4: boolean
  /** VP9 or VP8 at the export size. */
  webm: boolean
  aacEncode: boolean
  opusEncode: boolean
  webmCodec: 'vp9' | 'vp8' | null
}

/** What this browser can encode at `size`, so the export dialog offers only what will work. */
export async function exportSupport(size: [number, number]): Promise<ExportSupport> {
  const { canEncodeVideo, canEncodeAudio } = await import('mediabunny')
  const [width, height] = size
  // A probe that throws (no WebCodecs at all) just means "no".
  const can = (p: () => Promise<boolean>) => p().catch(() => false)
  const [avc, vp9, vp8, aacEncode, opusEncode] = await Promise.all([
    can(() => canEncodeVideo('avc', { width, height })),
    can(() => canEncodeVideo('vp9', { width, height })),
    can(() => canEncodeVideo('vp8', { width, height })),
    can(() => canEncodeAudio('aac')),
    can(() => canEncodeAudio('opus')),
  ])
  const webmCodec = vp9 ? 'vp9' : vp8 ? 'vp8' : null
  return { mp4: avc, webm: webmCodec !== null, aacEncode, opusEncode, webmCodec }
}
