import type { SelectOption } from '../ui/primitives'

// Transcript languages. The hint shows the cost before someone picks:
// English runs whisper-tiny; anything else needs whisper-small (lib/transcriber).
export const LANGUAGES: SelectOption[] = [
  { value: 'en', label: 'English', hint: 'Small model, ready in seconds' },
  { value: 'pt', label: 'Portuguese', hint: 'One-time 460 MB download' },
]
