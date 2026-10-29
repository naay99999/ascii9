import type { Rotation } from 'mediabunny'

export interface VideoInfo {
  /** Seconds. */
  duration: number
  /** Display size: pixel aspect and rotation already applied. */
  width: number
  height: number
  /** Average frame rate, or null when the file doesn't say. */
  fps: number | null
  rotation: Rotation
  videoCodec: string | null
  /** Whether this browser can decode the video track (WebCodecs). */
  canDecode: boolean
  audio: {
    codec: string
    sampleRate: number
    channels: number
    /** Its packets can be passed through as-is: the file describes the codec fully. */
    copyable: boolean
    /** This browser can decode it, so it can be re-encoded. */
    decodable: boolean
  } | null
}

/** How many packets to look at for the frame rate: enough for a steady average without reading
 * the whole file. */
const FPS_SAMPLE_PACKETS = 120

/** Reads what the app needs to know about a clip before playing or exporting it. Mediabunny is
 * loaded here on first use so it stays out of the initial bundle. */
export async function probeVideo(file: Blob): Promise<VideoInfo> {
  const { Input, BlobSource, ALL_FORMATS } = await import('mediabunny')
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS })
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null)
    if (!video) throw new Error("Couldn't read that video.")
    const audioTrack = await input.getPrimaryAudioTrack().catch(() => null)

    const [duration, width, height, rotation, videoCodec, canDecode, stats] = await Promise.all([
      input.computeDuration(),
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      video.getRotation(),
      video.getCodec(),
      video.canDecode().catch(() => false),
      video.computePacketStats(FPS_SAMPLE_PACKETS).catch(() => null),
    ])
    const rate = stats?.averagePacketRate
    const fps = rate && Number.isFinite(rate) && rate > 0 ? rate : null

    let audio: VideoInfo['audio'] = null
    if (audioTrack) {
      const [codec, sampleRate, channels, config, decodable] = await Promise.all([
        audioTrack.getCodec(),
        audioTrack.getSampleRate(),
        audioTrack.getNumberOfChannels(),
        audioTrack.getDecoderConfig().catch(() => null),
        audioTrack.canDecode().catch(() => false),
      ])
      // An audio codec Mediabunny can't name is treated as no audio rather than failing the clip.
      if (codec) audio = { codec, sampleRate, channels, copyable: !!config, decodable }
    }

    return { duration, width, height, fps, rotation, videoCodec, canDecode, audio }
  } finally {
    input.dispose()
  }
}
