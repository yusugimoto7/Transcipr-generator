'use client';

import { useState } from 'react';
import { X, UploadCloud, HardDrive, Mail, Copy, Check } from 'lucide-react';
import UploadBox from '@/components/docs/UploadBox';
import DriveImport from '@/components/DriveImport';
import { INTAKE_EMAIL } from '@/lib/publicConfig';

/**
 * "Add documents": the three ways documents reach a file, in one place —
 * upload, Google Drive (team only) and email to the team mailbox.
 * Kept mounted while closed (`open` only hides it) so a running Drive import
 * keeps reporting progress.
 */
export default function AddDocuments({ app, patchLocal, staff, open, onClose, onImported, onUploaded }) {
  const [tab, setTab] = useState('upload');
  const [copied, setCopied] = useState(false);
  const subject = `${app.clientNumber || ''} documents`.trim();

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* the text stays selectable */
    }
  }

  const tabs = [
    { id: 'upload', label: 'Upload', icon: UploadCloud },
    ...(staff ? [{ id: 'drive', label: 'Google Drive', icon: HardDrive }] : []),
    { id: 'email', label: 'By email', icon: Mail },
  ];

  return (
    <div className="modal-overlay" hidden={!open} onClick={onClose}>
      <div className="modal modal-lg" role="dialog" aria-modal="true" aria-labelledby="add-docs-h" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 id="add-docs-h">Add documents</h2>
            <p className="muted small">Files are matched to the checklist by the code at the start of the name, e.g. <span className="mono">101 - Birth Certificate - Sara.pdf</span>.</p>
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="tabs" role="tablist">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                  <Icon size={15} aria-hidden="true" /> {t.label}
                </button>
              );
            })}
          </div>
          <div hidden={tab !== 'upload'}>
            <UploadBox app={app} patchLocal={patchLocal} onUploaded={onUploaded} />
          </div>
          {staff && (
            <div hidden={tab !== 'drive'}>
              <DriveImport app={app} patchLocal={patchLocal} onImported={onImported} />
            </div>
          )}
          <div hidden={tab !== 'email'} className="stack-sm">
            <p className="small" style={{ margin: 0 }}>
              {staff
                ? 'Clients can email their documents. Each email is matched to this file, its attachments are read, checked, renamed the team’s way and copied to the client’s Drive folder under “01 - Documents”.'
                : 'You can also email your documents to us. They are added to your file automatically.'}
            </p>
            <dl className="kv" style={{ background: 'var(--sunk)', border: '1px solid var(--line)', borderRadius: 8, padding: '12px 14px' }}>
              <dt>Send to</dt>
              <dd className="cluster" style={{ gap: 6 }}>
                <span className="mono">{INTAKE_EMAIL}</span>
                <button type="button" className="icon-btn" onClick={() => copy(INTAKE_EMAIL)} aria-label="Copy the address">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
              </dd>
              {app.clientNumber && (
                <>
                  <dt>Subject</dt>
                  <dd className="cluster" style={{ gap: 6 }}>
                    <span className="mono">{subject}</span>
                    <button type="button" className="icon-btn" onClick={() => copy(subject)} aria-label="Copy the subject">{copied ? <Check size={14} /> : <Copy size={14} />}</button>
                  </dd>
                </>
              )}
            </dl>
            <p className="small faint" style={{ margin: 0 }}>
              {app.clientNumber
                ? `An email reaches this file when it mentions ${app.clientNumber} (subject or text), or comes from the email on the client's Odoo card.`
                : "Add a client file number to this file so emails can be matched reliably (or they must come from the email on the client's Odoo card)."}
              {staff ? ' Emails that match no file wait in Admin → Email intake.' : ''}
            </p>
          </div>
        </div>
        <div className="modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}
