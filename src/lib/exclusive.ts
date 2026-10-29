/** Wraps an async action so a call made while an earlier one is still running is ignored (a double
 * tap or double click). `fn` runs synchronously inside the call, before any await, so a browser API
 * that needs the user's gesture (navigator.share) still gets it. `onBusy` reports start and end so
 * the UI can disable the button meanwhile. */
export function exclusive(fn: () => Promise<void>, onBusy?: (busy: boolean) => void): () => Promise<void> {
  let busy = false
  return async () => {
    if (busy) return
    busy = true
    onBusy?.(true)
    try {
      await fn()
    } finally {
      busy = false
      onBusy?.(false)
    }
  }
}
