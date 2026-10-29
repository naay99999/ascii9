import { describe, expect, it } from 'vitest'
import { audioPlan } from '../../src/video/audioPlan'

const track = (codec: string, o: { copyable?: boolean; decodable?: boolean } = {}) => ({
  codec,
  sampleRate: 48000,
  channels: 2,
  copyable: true,
  decodable: true,
  ...o,
})

describe('audioPlan', () => {
  it('copies a track that is native to the container', () => {
    expect(audioPlan(track('aac'), 'mp4', true, false)).toBe('copy')
    expect(audioPlan(track('opus'), 'webm', true, false)).toBe('copy')
    expect(audioPlan(track('vorbis'), 'webm', true, false)).toBe('copy')
  })

  it('re-encodes a foreign track when the browser can encode', () => {
    expect(audioPlan(track('opus'), 'mp4', true, true)).toBe('encode')
    expect(audioPlan(track('aac'), 'webm', true, true)).toBe('encode')
  })

  it('drops a foreign track when the browser cannot encode', () => {
    expect(audioPlan(track('opus'), 'mp4', true, false)).toBe('none')
  })

  it('is none when sound is not wanted', () => {
    expect(audioPlan(track('aac'), 'mp4', false, true)).toBe('none')
    expect(audioPlan(track('opus'), 'webm', false, true)).toBe('none')
  })

  it('audioPlan is none without a source track', () => {
    expect(audioPlan(null, 'mp4', true, true)).toBe('none')
  })

  it('re-encodes a native track that cannot be passed through as-is', () => {
    expect(audioPlan(track('aac', { copyable: false }), 'mp4', true, true)).toBe('encode')
    expect(audioPlan(track('aac', { copyable: false }), 'mp4', true, false)).toBe('none')
  })

  it('is none when the track would need re-encoding but cannot be decoded', () => {
    expect(audioPlan(track('opus', { decodable: false }), 'mp4', true, true)).toBe('none')
    expect(audioPlan(track('aac', { copyable: false, decodable: false }), 'mp4', true, true)).toBe('none')
  })
})
