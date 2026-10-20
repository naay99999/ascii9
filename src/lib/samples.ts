export interface Sample {
  id: string
  label: string
  src: string
}

/** Bundled CC0 / public-domain samples (credits in public/samples/CREDITS.md).
 * The first entry is the one shown on first visit. Paths are relative so the
 * build works from any base (vite `base: './'`). */
export const SAMPLES: readonly Sample[] = [
  { id: 'sunflower', label: 'Sunflower', src: 'samples/sunflower.webp' },
  { id: 'cat', label: 'Cat', src: 'samples/cat.webp' },
  { id: 'portrait', label: 'Portrait', src: 'samples/portrait.webp' },
  { id: 'liberty', label: 'Statue of Liberty', src: 'samples/liberty.webp' },
]
