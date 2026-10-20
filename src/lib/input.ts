export type FileCheck = { ok: true } | { ok: false; message: string }

export const MAX_BYTES = 10 * 1024 * 1024
const READ_ERROR = "Couldn't read that image."

export function validateFile(f: { type: string; size: number }): FileCheck {
  if (!f.type.startsWith('image/')) return { ok: false, message: "That file isn't an image." }
  if (f.size > MAX_BYTES) return { ok: false, message: 'That image is over 10 MB.' }
  return { ok: true }
}

export async function loadBitmap(blob: Blob, maxEdge = 4096): Promise<ImageBitmap> {
  try {
    const first = await createImageBitmap(blob)
    const { width: w, height: h } = first
    if (!(w > 0) || !(h > 0)) {
      first.close?.()
      throw new Error('empty')
    }
    const long = Math.max(w, h)
    if (long <= maxEdge) return first
    first.close?.()
    const k = maxEdge / long
    const rw = w >= h ? maxEdge : Math.max(1, Math.round(w * k))
    const rh = h > w ? maxEdge : Math.max(1, Math.round(h * k))
    const second = await createImageBitmap(blob, { resizeWidth: rw, resizeHeight: rh, resizeQuality: 'high' })
    if (!(second.width > 0) || !(second.height > 0)) {
      second.close?.()
      throw new Error('empty')
    }
    return second
  } catch {
    throw new Error(READ_ERROR)
  }
}

type ClipItem = { kind: string; type: string; getAsFile(): File | null }

export function imageFromClipboard(items: DataTransferItemList | ArrayLike<ClipItem>): File | null {
  try {
    const list = items as ArrayLike<ClipItem>
    for (let i = 0; i < list.length; i++) {
      const it = list[i]
      if (it && it.kind === 'file' && typeof it.type === 'string' && it.type.startsWith('image/')) {
        const f = it.getAsFile()
        if (f) return f
      }
    }
  } catch {
    /* odd input */
  }
  return null
}

export function imageFromDrop(dt: { files: ArrayLike<File> }): File | null {
  try {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i]
      if (f && typeof f.type === 'string' && f.type.startsWith('image/')) return f
    }
  } catch {
    /* odd input */
  }
  return null
}
