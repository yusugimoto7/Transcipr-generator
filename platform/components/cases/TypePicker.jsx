'use client';

import { useState } from 'react';
import { Search } from 'lucide-react';
import { APP_TYPE_LIST, TYPE_GROUPS } from '@/lib/appTypes';

// Picker order follows the TR team's service groups; any stray group goes last.
const GROUPS = [...new Set([...TYPE_GROUPS, ...APP_TYPE_LIST.map((t) => t.group)])].filter((g) => APP_TYPE_LIST.some((t) => t.group === g));

/** The application types, grouped by service, with a search box. */
export default function TypePicker({ value, onChange, onPick }) {
  const [find, setFind] = useState('');
  const f = find.trim().toLowerCase();
  const matches = (t) => !f || `${t.title} ${t.service || ''} ${t.description} ${t.group}`.toLowerCase().includes(f);
  return (
    <>
      <div className="input-icon" style={{ marginBottom: 14 }}>
        <Search size={15} aria-hidden="true" />
        <input type="search" autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Search: visitor, spouse, 100-304, PGWP…" aria-label="Search application types" />
      </div>
      {GROUPS.map((g) => {
        const list = APP_TYPE_LIST.filter((t) => t.group === g && matches(t));
        if (!list.length) return null;
        return (
          <div key={g} style={{ marginBottom: 16 }}>
            <h3>{g}</h3>
            <div className="type-grid" role="radiogroup" aria-label={g}>
              {list.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="radio"
                  aria-checked={value === t.key}
                  className={`type-card${value === t.key ? ' on' : ''}`}
                  onClick={() => onChange(t.key)}
                  onDoubleClick={() => onPick?.(t.key)}
                >
                  <span className="tt"><span>{t.title}</span>{t.service && <span className="mono faint" style={{ fontWeight: 500 }}>{t.service}</span>}</span>
                  <span className="td">{t.description}</span>
                </button>
              ))}
            </div>
          </div>
        );
      })}
      {!APP_TYPE_LIST.some(matches) && <p className="muted">No type matches “{find}”.</p>}
    </>
  );
}
