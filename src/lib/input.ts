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

export const MAX_VIDEO_BYTES = 200 * 1024 * 1024
export const MAX_VIDEO_SECONDS = { desktop: 60, mobile: 30 }

export type MediaKind = 'image' | 'video'

/** File extensions to go by when the browser gives no specific type (some drops and pickers
 * report '' or application/octet-stream). */
const EXTENSIONS: Record<string, MediaKind> = {
  mp4: 'video', mov: 'video', m4v: 'video', webm: 'video',
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', gif: 'image', avif: 'image', bmp: 'image',
}

export function mediaKind(f: { type: string; name?: string }): MediaKind | null {
  const type = typeof f.type === 'string' ? f.type : ''
  if (type.startsWith('image/')) return 'image'
  if (type.startsWith('video/')) return 'video'
  if (type !== '' && type !== 'application/octet-stream') return null
  const m = typeof f.name === 'string' ? /\.([a-z0-9]+)$/i.exec(f.name) : null
  return (m && EXTENSIONS[m[1].toLowerCase()]) || null
}

export function validateMedia(
  f: { type: string; name?: string; size: number },
): { ok: true; kind: MediaKind } | { ok: false; message: string } {
  const kind = mediaKind(f)
  if (!kind) return { ok: false, message: "That file isn't an image or video." }
  if (kind === 'image') {
    if (f.size > MAX_BYTES) return { ok: false, message: 'That image is over 10 MB.' }
    return { ok: true, kind }
  }
  if (f.size > MAX_VIDEO_BYTES) return { ok: false, message: 'That video is over 200 MB.' }
  return { ok: true, kind }
}

export function checkDuration(seconds: number, mobile: boolean): FileCheck {
  if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, message: "Couldn't read that video's length." }
  const max = mobile ? MAX_VIDEO_SECONDS.mobile : MAX_VIDEO_SECONDS.desktop
  if (seconds > max) return { ok: false, message: `That video is longer than ${max} seconds.` }
  return { ok: true }
}

export function mediaFromDrop(dt: { files: ArrayLike<File> }): File | null {
  try {
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i]
      if (f && mediaKind(f)) return f
    }
  } catch {
    /* odd input */
  }
  return null
}
