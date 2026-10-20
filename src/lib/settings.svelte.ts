import { loadSettings, saveSettings, defaultSettings, createDebouncedSaver } from './settingsStorage'
import type { Settings } from '../engine/types'

export { loadSettings, saveSettings } from './settingsStorage'

function getStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** Deep-reactive store. Mutate fields on `settings.value`, or assign a whole Settings. */
export const settings: { value: Settings } = $state({ value: loadSettings(getStorage()) })

export function resetSettings(): void {
  settings.value = defaultSettings()
}

const saver = createDebouncedSaver((s) => saveSettings(getStorage(), s), 300)

$effect.root(() => {
  $effect(() => {
    saver.schedule($state.snapshot(settings.value) as Settings) // reads every field, so any change re-runs
  })
})

if (typeof window !== 'undefined') window.addEventListener('pagehide', () => saver.flush())
