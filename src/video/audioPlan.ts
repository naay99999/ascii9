import type { VideoInfo } from './probe'

/** What to do with the clip's sound on export: pass the packets through, re-encode, or leave it out. */
export type AudioPlan = 'copy' | 'encode' | 'none'

/** Audio codecs each container takes as-is (Mediabunny codec names). */
const NATIVE: Record<'mp4' | 'webm', readonly string[]> = {
  mp4: ['aac'],
  webm: ['opus', 'vorbis'],
}

export function audioPlan(
  source: VideoInfo['audio'],
  container: 'mp4' | 'webm',
  wanted: boolean,
  canEncode: boolean,
): AudioPlan {
  if (!wanted || !source) return 'none'
  if (NATIVE[container].includes(source.codec)) return 'copy'
  return canEncode ? 'encode' : 'none'
}
