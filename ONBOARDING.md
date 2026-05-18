# Video Slicer — Onboarding

## O que é

App web 100% client-side para extrair frames de vídeos e transcrever o áudio, sem upload para nenhum servidor. O arquivo nunca sai da máquina do usuário.

- **URL produção:** https://frame-slicer.vercel.app
- **Dev local:** `npm run dev` → http://localhost:5175
- **Repo:** `/Users/Verlindo/Documents/-Figma_Console_MCP/Constellation_Code/Frame_Slicer/`
- **Branch:** `main`

---

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | React 18 + TypeScript (Vite 6) |
| Estilo | Tailwind v4 (`@tailwindcss/vite`) + CSS custom properties (Constellation tokens) |
| Fontes | `@fontsource/inter` + `@fontsource/roboto` (sem CDN — necessário por causa dos headers COEP) |
| Extração de frames (nativo) | HTMLVideoElement + Canvas API |
| Extração de frames (fallback) | FFmpeg.wasm — `@ffmpeg/ffmpeg` + `@ffmpeg/util` |
| Transcrição | `@huggingface/transformers` v4 com modelo `Xenova/whisper-tiny` fp32 |
| ZIP | JSZip |
| Dropzone | react-dropzone |
| Ícones | lucide-react |

---

## Headers obrigatórios (COOP/COEP)

Tanto FFmpeg.wasm quanto o ONNX Runtime do Whisper precisam de `SharedArrayBuffer`, que requer:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

Configurados em dois lugares:
- **Dev:** `vite.config.ts` → `server.headers`
- **Prod:** `vercel.json` → `headers`

---

## Estrutura de arquivos

```
src/
├── App.tsx                   # Estado principal, orquestra tudo
├── main.tsx                  # Entry point
├── components/
│   ├── Navbar.tsx            # Wordmark Constellation SVG (160px), sem botões
│   ├── Dropzone.tsx          # react-dropzone, aceita MP4/MOV/WEBM/MKV
│   ├── Workspace.tsx         # Card de vídeo + card de parâmetros (3 modos)
│   ├── ResultsArea.tsx       # Área com tabs: Frames | Transcription ← principal
│   ├── FrameGrid.tsx         # Legado (não usado mais, mantido por precaução)
│   └── TranscriptPanel.tsx   # Legado (não usado mais, mantido por precaução)
├── lib/
│   ├── extractor.ts          # Tipos Frame, ExtractionParams; extractNative, extractFFmpeg, buildTimestamps
│   ├── transcriber.ts        # Whisper pipeline, transcribeFile, transcriptToMarkdown
│   └── zip.ts                # packAsZip(frames, transcriptMd?), triggerDownload, frameFilename
└── styles/
    ├── tokens.css            # CSS custom properties do design system Constellation
    └── index.css             # Estilos globais, classes utilitárias, @keyframes spin/pulse
```

---

## Fluxo da aplicação

### 1. Upload de vídeo (`App.tsx → handleFile`)
- Cria elemento `<video>` temporário (probe) para detectar duração/dimensões
- Se o codec for suportado nativamente → `videoMode: 'native'`
- Se não → carrega FFmpeg.wasm e faz probe com ele → `videoMode: 'ffmpeg'`
- **Logo após o probe**, dispara `transcribeFile()` em background (fire-and-forget)
- O `videoRef` aponta para o `<video>` dentro de `Workspace.tsx` — nunca há dois elementos no mesmo ref

### 2. Transcrição (`lib/transcriber.ts`)
- Modelo: `Xenova/whisper-tiny`, `dtype: 'fp32'` (evita bugs de quantização do ONNX Runtime dev build)
- ~75 MB, baixado uma vez e cacheado no `Cache Storage` do browser
- Decodifica áudio via `AudioContext({ sampleRate: 16000 })`
- Fallback para FFmpeg extrair WAV se `AudioContext.decodeAudioData` falhar (MKV, etc.)
- `onStatus` callback retorna `(status, msg, progress)` — progress é 0–100 só durante download
- Status: `'idle' | 'loading-model' | 'model-cached' | 'decoding-audio' | 'transcribing' | 'done' | 'error'`

### 3. Extração de frames (`lib/extractor.ts`)
- **Native:** seek + canvas `drawImage` + `toBlob(quality)` → async generator `extractNative`
- **FFmpeg:** `-ss [timestamp] -frames:v 1 -q:v [qscale]` → async generator `extractFFmpeg`
- `buildTimestamps(duration, params)` gera os timestamps para modos `interval` e `count`
- Modo `custom`: o usuário marca frames manualmente no vídeo, timestamps vêm de `markedFrames`
- Frames chegam via async generator → streaming para UI (FrameGrid aparece frame a frame)

### 4. ResultsArea (`components/ResultsArea.tsx`)
Componente principal da área de resultados — abaixo do `Workspace`.

- **Tab Frames:** grid de frames, download individual, botão Clear, Download ZIP
  - Checkbox "Include transcript in ZIP" aparece quando transcrição está pronta
- **Tab Transcription:** texto completo com chunks e timecodes, barra de progresso de download, indicador de cache
  - Botão Copy (com fallback `execCommand` para ambientes COOP)
  - Botão Download .md
- Auto-switch para tab Frames quando o primeiro frame chega
- Volta para tab Transcription quando frames são limpos

---

## Parâmetros de extração

```ts
type ExtractionParams = {
  mode: 'interval' | 'count' | 'custom'
  interval: number   // segundos entre frames (modo interval)
  count: number      // total de frames (modo count)
  quality: number    // 0.5–1.0 → JPEG quality
}
```

Modo `custom`: user scruba o vídeo e clica "Mark frame". Cada mark captura thumbnail 320px via canvas para preview na lista.

---

## ZIP com transcrição

`packAsZip(frames, transcriptMd?)` em `lib/zip.ts`:
- Se `transcriptMd` passado, inclui `transcript.md` no ZIP
- Formato do MD: `# Transcript — filename`, seção de texto completo, seção de segmentos com timestamps `**MM:SS → MM:SS**`

---

## Portas locais (convenção do projeto)

| App | Porta |
|---|---|
| VW Funds | 5173 |
| Constellation_App | 5174 |
| **Video Slicer** | **5175** |

---

## Deploy

```bash
vercel --prod
```

`vercel.json` já tem os headers COOP/COEP. Limite do Vercel é 100 MB — o WASM do ONNX Runtime vai junto no bundle (~23 MB gzip).

---

## Comandos úteis

```bash
npm run dev      # dev server na :5175
npm run build    # build de produção (checa TS)
vercel --prod    # deploy para https://frame-slicer.vercel.app
```

---

## Pontos de atenção

1. **Um só `<video>` no DOM** — o probe usa elemento temporário descartável. O `videoRef` aponta exclusivamente para o `<video>` em `Workspace.tsx`. Nunca criar um segundo elemento apontando para o mesmo ref.

2. **`seekTo` tem guard** — rejeita se `!isFinite(video.duration) || video.readyState < 1`. Qualquer mudança em `handleFile` deve respeitar isso.

3. **Modelo Whisper** — `Xenova/whisper-tiny` fp32. Tentativas anteriores com `Xenova/whisper-base` (q4) e `onnx-community/whisper-base` (q8) falharam com erro `TransposeDQWeightsForMatMulNBits` por incompatibilidade com a build de dev do ONNX Runtime instalada. Não trocar sem testar.

4. **COOP/COEP e Clipboard API** — os headers de segurança podem bloquear `navigator.clipboard` em alguns contextos. O botão Copy tem fallback via `textarea + execCommand`.

5. **`FrameGrid.tsx` e `TranscriptPanel.tsx`** — componentes legados, não renderizados mais. `ResultsArea.tsx` absorveu toda a lógica deles.
