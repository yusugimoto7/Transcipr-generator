'use client';

import { useRef, useState } from 'react';
import { UploadCloud, X, FileText } from 'lucide-react';

const ACCEPT = ['.pdf', '.docx', '.jpg', '.jpeg', '.png', '.webp'];
const accepted = (file) => ACCEPT.some((ext) => (file.name || '').toLowerCase().endsWith(ext));

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`The server did not answer properly (HTTP ${res.status}) — it may be restarting. Wait a minute and try again.`);
  }
}

/**
 * Drag-and-drop upload. `rename(file, index)` may return a new file name —
 * used when uploading for a specific checklist item, so the file carries the
 * item's code and lands in the right box.
 */
export default function UploadBox({ app, patchLocal, rename, onUploaded, hint, compact }) {
  const [pending, setPending] = useState([]);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const input = useRef(null);

  function add(list) {
    const files = Array.from(list || []);
    const ok = files.filter(accepted);
    setPending((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}:${f.size}`));
      return [...prev, ...ok.filter((f) => !seen.has(`${f.name}:${f.size}`))];
    });
    setMsg(files.length > ok.length ? { type: 'err', text: `${files.length - ok.length} file(s) skipped — only PDF, DOCX, JPG, PNG and WEBP are accepted.` } : null);
  }

  async function upload() {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    pending.forEach((f, i) => {
      const name = rename?.(f, i);
      fd.append('files', name ? new File([f], name, { type: f.type }) : f);
    });
    try {
      const res = await fetch(`/api/applications/${app.id}/upload`, { method: 'POST', body: fd });
      const data = await readJson(res);
      if (!res.ok) throw new Error(data.error || 'Upload failed.');
      patchLocal({ documents: data.documents });
      setPending([]);
      if (input.current) input.current.value = '';
      setMsg({ type: 'ok', text: `Uploaded ${data.added.length} file(s).` });
      onUploaded?.(data.added);
    } catch (e) {
      setMsg({ type: 'err', text: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack-sm">
      <div
        className={`dropzone${over ? ' over' : ''}`}
        style={compact ? { padding: '16px 14px' } : undefined}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={(e) => { e.preventDefault(); setOver(false); }}
        onDrop={(e) => { e.preventDefault(); setOver(false); add(e.dataTransfer?.files); }}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.current?.click(); } }}
        role="button"
        tabIndex={0}
        aria-label="Choose files to upload"
      >
        <UploadCloud size={compact ? 22 : 28} aria-hidden="true" />
        <strong>Drop files here or click to choose</strong>
        <span className="small">{hint || 'PDF, Word, JPG, PNG or WEBP — several at once is fine.'}</span>
        <input ref={input} type="file" multiple accept={ACCEPT.join(',')} style={{ display: 'none' }} onChange={(e) => add(e.target.files)} />
      </div>

      {pending.length > 0 && (
        <div className="list">
          {pending.map((f, i) => (
            <div className="list-row" key={`${f.name}:${f.size}`} style={{ padding: '8px 12px' }}>
              <FileText size={16} className="faint" aria-hidden="true" />
              <div className="grow small">
                <div className="strong" style={{ overflowWrap: 'anywhere' }}>{rename?.(f, i) || f.name}</div>
                {rename?.(f, i) && <div className="faint tiny">from {f.name}</div>}
              </div>
              <span className="small faint nowrap">{Math.max(1, Math.round(f.size / 1024))} KB</span>
              <button type="button" className="icon-btn" onClick={() => setPending((p) => p.filter((_, j) => j !== i))} aria-label={`Remove ${f.name}`}>
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}
      {pending.length > 0 && (
        <div className="btn-row">
          <button type="button" onClick={upload} disabled={busy}>
            {busy ? <span className="spinner" /> : `Upload ${pending.length} file${pending.length === 1 ? '' : 's'}`}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setPending([])} disabled={busy}>Clear</button>
        </div>
      )}
      {msg && <div className={`alert ${msg.type === 'err' ? 'err' : 'ok'}`} style={{ margin: 0 }}>{msg.text}</div>}
    </div>
  );
}
