/// <reference lib="webworker" />
// Speech recognition off the main thread. Whisper inference is seconds to
// minutes of solid compute; on the page it froze scrolling, the scrubber and
// every click. Here it only costs a core. Models stay cached in this worker
// for the life of the tab, so a second run skips the load.
import { pipeline, env } from '@huggingface/transformers'

env.allowLocalModels = false

type Asr = Awaited<ReturnType<typeof pipeline>>
const models = new Map<string, Promise<Asr>>()

export type AsrRequest =
  | { id: number; type: 'load'; model: string }
  | { id: number; type: 'run'; model: string; samples: Float32Array; language: string }
export type AsrReply =
  | { id: number; type: 'progress'; pct: number | null }
  | { id: number; type: 'loaded'; cached: boolean }
  | { id: number; type: 'result'; result: unknown }
  | { id: number; type: 'error'; message: string }

const post = (m: AsrReply) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(m)

function load(id: number, model: string): Promise<Asr> {
  let p = models.get(model)
  if (p) return p
  const sizes = new Map<string, number>(), loaded = new Map<string, number>()
  p = pipeline('automatic-speech-recognition', model, {
    dtype: 'fp32',
    progress_callback: (e: any) => {
      if (e.status !== 'progress' || !e.file) return
      if (e.total) sizes.set(e.file, e.total)
      if (e.loaded) loaded.set(e.file, e.loaded)
      const total = [...sizes.values()].reduce((a, b) => a + b, 0)
      const done = [...loaded.values()].reduce((a, b) => a + b, 0)
      post({ id, type: 'progress', pct: total > 0 ? Math.round((done / total) * 100) : null })
    },
  })
  p.catch(() => models.delete(model)) // a failed download can be retried
  models.set(model, p)
  return p
}

self.onmessage = async (e: MessageEvent<AsrRequest>) => {
  const m = e.data
  try {
    if (m.type === 'load') {
      const cached = models.has(m.model)
      await load(m.id, m.model)
      post({ id: m.id, type: 'loaded', cached })
    } else {
      const asr = await load(m.id, m.model)
      const result = await (asr as any)(m.samples, {
        task: 'transcribe', language: m.language,
        chunk_length_s: 30, stride_length_s: 5, return_timestamps: true,
      })
      post({ id: m.id, type: 'result', result })
    }
  } catch (err) {
    post({ id: m.id, type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
