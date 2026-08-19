import {useCallback, useRef, useState} from 'react'
import {set, unset, type StringInputProps} from 'sanity'

const UPLOAD_URL = (import.meta as any).env?.SANITY_STUDIO_UPLOAD_URL ?? ''
const UPLOAD_TOKEN = (import.meta as any).env?.SANITY_STUDIO_UPLOAD_TOKEN ?? ''

export function VideoUpload(props: StringInputProps) {
  const {onChange, value, readOnly} = props
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [showPaste, setShowPaste] = useState(!UPLOAD_URL)
  const [pasteUrl, setPasteUrl] = useState('')

  const upload = useCallback(
    (file: File) => {
      if (!UPLOAD_URL) {
        setError('Upload not configured — paste a URL instead, or set SANITY_STUDIO_UPLOAD_URL')
        return
      }
      if (file.size > 95 * 1024 * 1024) {
        setError('File is over 95 MB — upload it to R2 manually and paste the URL')
        return
      }
      setUploading(true)
      setProgress(0)
      setError(null)

      const xhr = new XMLHttpRequest()
      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100))
      })
      xhr.addEventListener('load', () => {
        setUploading(false)
        if (xhr.status === 200) {
          try {
            onChange(set(JSON.parse(xhr.responseText).url))
          } catch {
            setError('Bad response from upload server')
          }
        } else {
          let msg = `Upload failed (${xhr.status})`
          try {
            const body = JSON.parse(xhr.responseText)
            if (body.error) msg = body.error
          } catch {}
          setError(msg)
        }
      })
      xhr.addEventListener('error', () => {
        setUploading(false)
        setError('Upload failed — check your connection')
      })

      const form = new FormData()
      form.append('file', file)
      xhr.open('POST', UPLOAD_URL)
      if (UPLOAD_TOKEN) xhr.setRequestHeader('X-Upload-Token', UPLOAD_TOKEN)
      xhr.send(form)
    },
    [onChange],
  )

  const commitPaste = useCallback(() => {
    const url = pasteUrl.trim()
    if (url) {
      onChange(set(url))
      setPasteUrl('')
      setShowPaste(false)
    }
  }, [pasteUrl, onChange])

  // --- has a value: preview + clear ---
  if (value) {
    return (
      <div style={s.preview}>
        <video
          src={value}
          controls
          controlsList="nodownload"
          preload="metadata"
          style={s.video}
        />
        <div style={s.url}>{value}</div>
        {!readOnly && (
          <button type="button" style={{...s.btn, ...s.btnDanger}} onClick={() => onChange(unset())}>
            Remove video
          </button>
        )}
      </div>
    )
  }

  // --- uploading: progress bar ---
  if (uploading) {
    return (
      <div style={{padding: '1.5rem', textAlign: 'center'}}>
        <div style={{marginBottom: '0.5rem', fontSize: '0.875rem', fontWeight: 500}}>
          Uploading… {progress}%
        </div>
        <div style={s.bar}>
          <div style={{...s.barFill, width: `${progress}%`}} />
        </div>
      </div>
    )
  }

  // --- empty: drop zone + paste fallback ---
  return (
    <div>
      {UPLOAD_URL && (
        <div
          style={{...s.drop, ...(dragOver ? s.dropActive : {})}}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files[0]
            if (file) upload(file)
          }}
        >
          <div style={{fontSize: '0.9375rem', fontWeight: 500, marginBottom: '0.25rem'}}>
            Drop a video here or click to browse
          </div>
          <div style={{fontSize: '0.8125rem', color: '#888'}}>MP4, WebM, or MOV</div>
          <input
            ref={fileRef}
            type="file"
            accept=".mp4,.mov,.m4v,.webm,video/mp4,video/webm,video/quicktime"
            style={{display: 'none'}}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) upload(file)
            }}
          />
        </div>
      )}

      {error && <div style={s.error}>{error}</div>}

      {showPaste ? (
        <div style={s.row}>
          <input
            style={s.input}
            value={pasteUrl}
            onChange={(e) => setPasteUrl(e.target.value)}
            placeholder="https://..."
            onKeyDown={(e) => e.key === 'Enter' && commitPaste()}
          />
          <button type="button" style={s.btn} onClick={commitPaste} disabled={!pasteUrl.trim()}>
            Set
          </button>
          {UPLOAD_URL && (
            <button
              type="button"
              style={s.btn}
              onClick={() => {
                setShowPaste(false)
                setPasteUrl('')
              }}
            >
              Cancel
            </button>
          )}
        </div>
      ) : (
        <div style={s.hint} onClick={() => setShowPaste(true)}>
          or paste a URL
        </div>
      )}
    </div>
  )
}

const s = {
  drop: {
    border: '2px dashed #cad1dc',
    borderRadius: '6px',
    padding: '2rem',
    textAlign: 'center' as const,
    cursor: 'pointer',
    transition: 'border-color 0.15s, background 0.15s',
  },
  dropActive: {
    borderColor: '#2276fc',
    background: '#f0f6ff',
  },
  bar: {
    width: '100%',
    height: '6px',
    background: '#e4e8ed',
    borderRadius: '3px',
    overflow: 'hidden' as const,
  },
  barFill: {
    height: '100%',
    background: '#2276fc',
    borderRadius: '3px',
    transition: 'width 0.2s',
  },
  preview: {
    border: '1px solid #e0e3e8',
    borderRadius: '6px',
    padding: '0.75rem',
  },
  video: {
    width: '100%',
    maxHeight: '180px',
    background: '#000',
    borderRadius: '4px',
    marginBottom: '0.5rem',
  },
  url: {
    fontSize: '0.75rem',
    color: '#888',
    wordBreak: 'break-all' as const,
    marginBottom: '0.5rem',
  },
  error: {
    background: '#fff0f0',
    border: '1px solid #fcc',
    borderRadius: '6px',
    padding: '0.5rem 0.75rem',
    color: '#c33',
    fontSize: '0.8125rem',
    marginTop: '0.5rem',
  },
  btn: {
    padding: '0.375rem 0.75rem',
    border: '1px solid #cad1dc',
    borderRadius: '4px',
    background: '#fff',
    cursor: 'pointer',
    fontSize: '0.8125rem',
  },
  btnDanger: {
    borderColor: '#e0a0a0',
    color: '#c33',
  },
  row: {
    display: 'flex',
    gap: '0.5rem',
    marginTop: '0.5rem',
  },
  input: {
    flex: 1,
    padding: '0.375rem 0.5rem',
    border: '1px solid #cad1dc',
    borderRadius: '4px',
    fontSize: '0.8125rem',
  },
  hint: {
    fontSize: '0.75rem',
    color: '#888',
    marginTop: '0.5rem',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
}
