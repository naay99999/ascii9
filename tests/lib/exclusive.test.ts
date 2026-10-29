import { expect, test, vi } from 'vitest'
import { exclusive } from '../../src/lib/exclusive'

test('ignores a second call while the first is running, runs again once it settles', async () => {
  let finish!: () => void
  const fn = vi.fn(() => new Promise<void>((r) => (finish = r)))
  const busy = vi.fn()
  const run = exclusive(fn, busy)
  const first = run()
  // Called synchronously: no await before fn, so a user-gesture API inside it still works.
  expect(fn).toHaveBeenCalledTimes(1)
  await run()
  expect(fn).toHaveBeenCalledTimes(1)
  expect(busy.mock.calls).toEqual([[true]])
  finish()
  await first
  expect(busy.mock.calls).toEqual([[true], [false]])
  void run()
  expect(fn).toHaveBeenCalledTimes(2)
})

test('frees itself when the action fails', async () => {
  const fn = vi.fn(() => Promise.reject(new Error('no')))
  const run = exclusive(fn)
  await expect(run()).rejects.toThrow('no')
  await expect(run()).rejects.toThrow('no')
  expect(fn).toHaveBeenCalledTimes(2)
})
