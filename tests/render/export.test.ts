import { expect, test } from 'vitest'
import { fileName, gridToText } from '../../src/render/export'

test('gridToText keeps special characters', () => {
  const g = { cols: 3, rows: 2, glyphs: [' ', '<', '&', '"'], index: new Uint16Array([1, 2, 3, 0, 0, 1]), rgb: new Uint8Array(18) }
  expect(gridToText(g)).toBe('<&"\n  <')
})
test('gridToText handles a 1-row grid and keeps trailing spaces', () => {
  const g = { cols: 3, rows: 1, glyphs: [' ', 'a'], index: new Uint16Array([1, 0, 0]), rgb: new Uint8Array(9) }
  expect(gridToText(g)).toBe('a  ')
})
test('fileName uses local date', () => expect(fileName('png', new Date(2026, 9, 21))).toBe('ascii9-2026-10-21.png'))
test('fileName supports jpg and txt', () => {
  expect(fileName('jpg', new Date(2026, 0, 5))).toBe('ascii9-2026-01-05.jpg')
  expect(fileName('txt', new Date(2026, 11, 31))).toBe('ascii9-2026-12-31.txt')
})
test('fileName supports video formats', () => {
  expect(fileName('mp4', new Date(2026, 9, 29))).toBe('ascii9-2026-10-29.mp4')
  expect(fileName('webm', new Date(2026, 9, 29))).toBe('ascii9-2026-10-29.webm')
  expect(fileName('gif', new Date(2026, 9, 29))).toBe('ascii9-2026-10-29.gif')
})
