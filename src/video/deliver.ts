/** The parts of `navigator` file sharing needs; injectable so the choice is testable without a browser. */
export interface ShareNav {
  canShare?: (data: { files: File[] }) => boolean
  share?: (data: { files: File[] }) => Promise<void>
}

/** How a finished export reaches the user: phones that can share the file get the share sheet
 * (so "Save Video" puts it in Photos), everything else downloads. */
export function deliveryMode(nav: ShareNav | undefined, mobile: boolean, file: File): 'share' | 'download' {
  if (!mobile || typeof nav?.canShare !== 'function') return 'download'
  try {
    return nav.canShare({ files: [file] }) ? 'share' : 'download'
  } catch {
    return 'download'
  }
}

/** Opens the share sheet for `file`. Closing the sheet is the user's choice, not an error:
 * 'closed'. Any other failure is 'failed', and the caller downloads instead. */
export async function shareFile(nav: ShareNav | undefined, file: File): Promise<'shared' | 'closed' | 'failed'> {
  if (typeof nav?.share !== 'function') return 'failed'
  try {
    await nav.share({ files: [file] })
    return 'shared'
  } catch (e) {
    return (e as { name?: unknown } | null)?.name === 'AbortError' ? 'closed' : 'failed'
  }
}
