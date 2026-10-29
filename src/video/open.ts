import { checkDuration } from '../lib/input'
import { probeVideo, type VideoInfo } from './probe'
import { createPlayer, type Player, type PlayerOptions } from './player'

export const VIDEO_READ_ERROR = "Couldn't read that video."

export interface OpenVideoOptions {
  mobile: boolean
  onFrame: PlayerOptions['onFrame']
  canTakeFrame: PlayerOptions['canTakeFrame']
  /** True once a newer load has started; the clip is then dropped. */
  stale: () => boolean
  /** Called after the clip passed every check, just before its player is created. */
  beforePlayer?: () => void
}

/** Probes the clip, checks its length and resolves with a player whose first frame is ready, or
 * null if a newer load overtook it (any player it made is disposed). Rejects with a message fit to
 * show the user: library errors are never surfaced as-is. */
export async function openVideo(file: File, opts: OpenVideoOptions): Promise<{ info: VideoInfo; player: Player } | null> {
  let info: VideoInfo
  try {
    info = await probeVideo(file)
  } catch {
    throw new Error(VIDEO_READ_ERROR)
  }
  if (opts.stale()) return null
  const check = checkDuration(info.duration, opts.mobile)
  if (!check.ok) throw new Error(check.message)

  opts.beforePlayer?.()
  const player = createPlayer(file, { onFrame: opts.onFrame, canTakeFrame: opts.canTakeFrame, fps: info.fps ?? 30 })
  try {
    await player.ready
  } catch {
    player.dispose()
    if (opts.stale()) return null
    throw new Error(VIDEO_READ_ERROR)
  }
  if (opts.stale()) {
    player.dispose()
    return null
  }
  return { info, player }
}
