import { expect, test } from 'vitest'
import { deliveryMode } from '../../src/video/deliver'

const file = { name: 'ascii9-2026-10-29.mp4' } as File

test('share on a phone when the browser can share the file', () => {
  const seen: unknown[] = []
  const nav = { canShare: (d: { files: File[] }) => (seen.push(d), true) }
  expect(deliveryMode(nav, true, file)).toBe('share')
  expect(seen).toEqual([{ files: [file] }])
})
test('download on desktop even when sharing works', () => {
  expect(deliveryMode({ canShare: () => true }, false, file)).toBe('download')
})
test('download when canShare is missing', () => {
  expect(deliveryMode({}, true, file)).toBe('download')
  expect(deliveryMode(undefined, true, file)).toBe('download')
})
test('download when canShare returns false', () => {
  expect(deliveryMode({ canShare: () => false }, true, file)).toBe('download')
})
test('download when canShare throws', () => {
  const nav = {
    canShare: () => {
      throw new TypeError('bad data')
    },
  }
  expect(deliveryMode(nav, true, file)).toBe('download')
})

test('shareFile: shared, closed sheet, other failure', async () => {
  const { shareFile } = await import('../../src/video/deliver')
  expect(await shareFile({ share: async () => {} }, file)).toBe('shared')
  const abort = new DOMException('closed', 'AbortError')
  expect(await shareFile({ share: () => Promise.reject(abort) }, file)).toBe('closed')
  expect(await shareFile({ share: () => Promise.reject(new DOMException('no', 'NotAllowedError')) }, file)).toBe('failed')
  expect(await shareFile({}, file)).toBe('failed')
})
