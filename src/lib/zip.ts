import JSZip from 'jszip'
import type { Frame } from './extractor'
import { fmtTimecode } from './extractor'

export function frameFilename(frame: Frame): string {
  const tc = fmtTimecode(frame.timestamp).replace(/[:.]/g, '-')
  return `frame_${String(frame.index).padStart(3, '0')}_${tc}.jpg`
}

export async function packAsZip(frames: Frame[]): Promise<Blob> {
  const zip = new JSZip()
  for (const frame of frames) {
    zip.file(frameFilename(frame), frame.blob)
  }
  return zip.generateAsync({ type: 'blob', compression: 'STORE' })
}

export function triggerDownload(blob: Blob, filename: string): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000)
}
