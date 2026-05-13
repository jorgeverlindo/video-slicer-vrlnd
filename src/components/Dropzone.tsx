import { useDropzone } from 'react-dropzone'
import { Upload } from 'lucide-react'

type Props = { onFile: (file: File) => void }

export default function Dropzone({ onFile }: Props) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: { 'video/*': ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'] },
    multiple: false,
    onDropAccepted: ([file]) => onFile(file),
  })

  return (
    <div {...getRootProps()} className={`dropzone${isDragActive ? ' dragover' : ''}`}>
      <input {...getInputProps()} />
      <div className="dropzone-icon">
        <Upload size={28} />
      </div>
      <div className="dropzone-title">
        {isDragActive ? 'Drop the video here' : 'Drop a video here or click to browse'}
      </div>
      <div className="dropzone-hint">
        MP4<span className="sep">·</span>MOV<span className="sep">·</span>WEBM
        <span className="sep">·</span>MKV<span className="sep">·</span>up to a few minutes
      </div>
    </div>
  )
}
