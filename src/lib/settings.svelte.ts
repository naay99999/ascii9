import { loadSettings, saveSettings, defaultSettings } from './settingsStorage'
import type { Settings } from '../engine/types'

export { loadSettings, saveSettings } from './settingsStorage'

function getStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/** Deep-reactive store. Mutate fields on `settings.value`, or assign a whole Settings. */
export const settings: { value: Settings } = $state({ value: loadSettings(getStorage()) })

export function resetSettings(): void {
  settings.value = defaultSettings()
}

let timer: ReturnType<typeof setTimeout> | undefined

$effect.root(() => {
  $effect(() => {
    const snapshot = $state.snapshot(settings.value) as Settings // reads every field, so any change re-runs
    clearTimeout(timer)
    timer = setTimeout(() => saveSettings(getStorage(), snapshot), 300)
  })
})
