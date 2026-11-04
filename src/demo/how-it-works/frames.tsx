// The seven frames the demo "extracts" from a recorded usability session,
// plus the recording's poster. Each is an illustration of a moment in the
// call, in the Video Slicer palette: no real faces, names, brands or client
// assets. They behave like photographs, so they keep their colors in both
// themes. Sources (1600×900 PNG) live in Exports/how-it-works-assets.

import poster from './keyframes/00_source-poster-call.jpg'
import talkA from './keyframes/01_intro-talk-a.jpg'
import library from './keyframes/02_library.jpg'
import dialog from './keyframes/03_bulk-dialog.jpg'
import edit from './keyframes/04_edit-metadata.jpg'
import detail from './keyframes/05_asset-detail.jpg'
import tags from './keyframes/06_tags.jpg'
import talkB from './keyframes/07_wrap-up-talk-b.jpg'

type P = { className?: string }

// Fetch them as soon as the demo loads, so no frame pops in mid-loop
if (typeof window !== 'undefined') {
  for (const src of [poster, talkA, library, dialog, edit, detail, tags, talkB]) {
    const img = new Image()
    img.src = src
  }
}

function art(src: string) {
  return function Art({ className }: P) {
    return (
      <img
        src={src}
        alt=""
        draggable={false}
        decoding="async"
        className={className}
        style={{ objectFit: 'cover' }}
      />
    )
  }
}

export const FrameTalkA = art(talkA)
export const FrameLibrary = art(library)
export const FrameDialog = art(dialog)
export const FrameEdit = art(edit)
export const FrameDetail = art(detail)
export const FrameTags = art(tags)
export const FrameTalkB = art(talkB)

/** The video's poster: a two-person call grid, as the file looks before slicing. */
export const CallPoster = art(poster)

/** The seven frames, in the order they sit in the recording. */
export const FRAMES = [
  { Art: FrameTalkA, time: '00:00:05', label: 'Intro' },
  { Art: FrameLibrary, time: '00:01:05', label: 'Library' },
  { Art: FrameDialog, time: '00:04:05', label: 'Bulk dialog' },
  { Art: FrameEdit, time: '00:06:05', label: 'Edit metadata' },
  { Art: FrameDetail, time: '00:11:05', label: 'Asset detail' },
  { Art: FrameTags, time: '00:16:05', label: 'Tags' },
  { Art: FrameTalkB, time: '00:26:05', label: 'Wrap-up' },
] as const
