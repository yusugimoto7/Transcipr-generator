'use client';

import { useEffect, useState } from 'react';

/**
 * A moment shown in the viewer's own time zone ("28 Sept 2026, 14:37").
 * Rendered after mount: the server does not know the viewer's time zone, and
 * a server-rendered time would otherwise stay in the server's (UTC).
 */
export default function LocalTime({ iso, withZone = false }) {
  const [text, setText] = useState('');
  useEffect(() => {
    if (!iso) return;
    const d = new Date(iso);
    const opts = { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', ...(withZone ? { timeZoneName: 'short' } : {}) };
    setText(d.toLocaleString('en-GB', opts));
  }, [iso, withZone]);
  return <time dateTime={iso} title={iso}>{text || ' '}</time>;
}
