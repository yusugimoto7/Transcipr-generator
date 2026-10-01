'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CLIENT_SECTIONS, CONFIRM_TEXT, clientProblems, clientProgress, answerProblem } from '@/lib/clientForm';
import { toJalali, toGregorian, parseJalali, isoDate } from '@/lib/jalali';

const T = {
  title: { fa: 'پرسشنامه اطلاعات متقاضی', en: 'Applicant questionnaire' },
  intro: {
    fa: 'لطفاً همه بخش‌ها را با دقت تکمیل کنید. اطلاعاتی که از مدارک شما داشتیم از قبل وارد شده است — آن‌ها را بررسی و در صورت نیاز اصلاح کنید. پاسخ‌ها خودکار ذخیره می‌شوند و می‌توانید بعداً با همین لینک ادامه دهید. تاریخ‌ها میلادی هستند؛ می‌توانید تاریخ شمسی را هم وارد کنید تا خودکار تبدیل شود.',
    en: 'Please complete every section carefully. What we already had from your documents is filled in — check it and correct it if needed. Answers save automatically, and you can come back with the same link to continue. Dates are Gregorian; you can also type a Persian (Shamsi) date and it is converted.',
  },
  saving: { fa: 'در حال ذخیره…', en: 'Saving…' },
  saved: { fa: 'ذخیره شد', en: 'Saved' },
  saveError: { fa: 'ذخیره نشد — اتصال اینترنت را بررسی کنید', en: 'Not saved — check your connection' },
  done: { fa: 'تکمیل شده', en: 'complete' },
  yes: { fa: 'بله', en: 'Yes' },
  no: { fa: 'خیر', en: 'No' },
  select: { fa: 'انتخاب کنید…', en: 'Select…' },
  remove: { fa: 'حذف', en: 'Remove' },
  shamsi: { fa: 'یا تاریخ شمسی:', en: 'or Persian date:' },
  shamsiPh: { fa: '۱۳۷۰/۰۵/۲۰', en: '1370/05/20' },
  englishOnly: { fa: 'به انگلیسی', en: 'in English' },
  required: { fa: 'الزامی', en: 'required' },
  missingTitle: { fa: 'پیش از ارسال، این موارد را تکمیل یا اصلاح کنید:', en: 'Before submitting, complete or correct these:' },
  confirmTitle: { fa: 'تأیید و ارسال', en: 'Confirm and submit' },
  confirmName: { fa: 'نام و نام خانوادگی شما (به عنوان امضا)', en: 'Your full name (as your signature)' },
  submit: { fa: 'ارسال نهایی', en: 'Submit' },
  submitNote: { fa: 'پس از ارسال، امکان تغییر پاسخ‌ها وجود ندارد.', en: 'After submitting, the answers can no longer be changed.' },
  submitted: { fa: 'پرسشنامه شما ارسال شد. از شما سپاسگزاریم.', en: 'Your questionnaire has been submitted. Thank you.' },
  submittedBy: { fa: 'تأیید شده توسط', en: 'Confirmed by' },
  lockedNote: { fa: 'برای تغییر اطلاعات با کارشناس پرونده خود تماس بگیرید.', en: 'To change anything, contact your case officer.' },
  first: { fa: 'ردیف', en: 'Row' },
};

const tr = (lang, x) => (x ? x[lang] ?? x.en : '');
const thisMonth = () => new Date().toISOString().slice(0, 7);
const today = () => new Date().toISOString().slice(0, 10);
const fa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);

/** The Persian date of a Gregorian YYYY-MM-DD, written for display. */
function shamsiOf(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const { jy, jm, jd } = toJalali(Number(m[1]), Number(m[2]), Number(m[3]));
  return `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;
}

function DateInput({ id, value, onChange, lang, disabled, notFuture }) {
  const [sh, setSh] = useState('');
  return (
    <div className="cq-date">
      <input id={id} type="date" dir="ltr" value={value || ''} max={notFuture ? today() : undefined} onChange={(e) => onChange(e.target.value)} disabled={disabled} />
      {!disabled && (
        <label className="cq-shamsi">
          <span>{tr(lang, T.shamsi)}</span>
          <input
            dir="ltr"
            inputMode="numeric"
            placeholder={tr(lang, T.shamsiPh)}
            value={sh}
            aria-label="Persian (Shamsi) date"
            onChange={(e) => {
              setSh(e.target.value);
              const j = parseJalali(e.target.value);
              if (j) onChange(isoDate(toGregorian(j.jy, j.jm, j.jd)));
            }}
          />
        </label>
      )}
      {value && shamsiOf(value) && (
        <span className="cq-hint">
          {lang === 'fa' ? 'برابر با' : 'Persian date:'} <bdi dir="ltr">{lang === 'fa' ? fa(shamsiOf(value)) : shamsiOf(value)}</bdi>
        </span>
      )}
    </div>
  );
}

function Control({ f, id, value, onChange, lang, disabled }) {
  if (f.type === 'yesno') {
    return (
      <div className="cq-seg" role="radiogroup" id={id} aria-label={tr(lang, f)}>
        {[[true, T.yes], [false, T.no]].map(([v, l]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} disabled={disabled} onClick={() => onChange(value === v ? '' : v)}>
            {tr(lang, l)}
          </button>
        ))}
      </div>
    );
  }
  if (f.type === 'select') {
    return (
      <select id={id} value={value ?? ''} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
        <option value="">{tr(lang, T.select)}</option>
        {f.options.map((op) => <option key={String(op.v)} value={op.v}>{op[lang]}</option>)}
        {value && !f.options.some((op) => op.v === value) && <option value={value}>{value}</option>}
      </select>
    );
  }
  if (f.type === 'date') return <DateInput id={id} value={value} onChange={onChange} lang={lang} disabled={disabled} notFuture={f.notFuture} />;
  if (f.type === 'month') return <input id={id} type="month" dir="ltr" placeholder="YYYY-MM" max={f.notFuture ? thisMonth() : undefined} value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  if (f.type === 'textarea') return <textarea id={id} rows={3} value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
  const type = { email: 'email', tel: 'tel' }[f.type] || 'text';
  return <input id={id} type={type} dir={f.latin || type !== 'text' ? 'ltr' : 'auto'} value={value || ''} onChange={(e) => onChange(e.target.value)} disabled={disabled} />;
}

function Label({ f, lang, htmlFor }) {
  return (
    <label htmlFor={htmlFor} className="cq-label">
      {tr(lang, f)}
      {f.required && <span className="cq-req" title={tr(lang, T.required)}> *</span>}
      {f.latin && <span className="cq-en">{tr(lang, T.englishOnly)}</span>}
    </label>
  );
}

function Rows({ f, value, onChange, lang, disabled, problems }) {
  const list = Array.isArray(value) && value.length ? value : [{}];
  const set = (i, col, v) => onChange(list.map((r, j) => (j === i ? { ...r, [col]: v } : r)));
  return (
    <div className="cq-rows">
      {list.map((r, i) => (
        <fieldset key={i} className="cq-row">
          <legend>{i === 0 && f.firstLabel ? tr(lang, f.firstLabel) : `${tr(lang, f)} ${lang === 'fa' ? fa(i + 1) : i + 1}`}</legend>
          {!disabled && (list.length > 1 || Object.keys(r).length > 0) && (
            <button type="button" className="cq-remove" onClick={() => onChange(list.filter((_, j) => j !== i))}>{tr(lang, T.remove)}</button>
          )}
          <div className="cq-grid">
            {f.columns.map((c) => {
              const id = `${f.id}-${i}-${c.id}`;
              const p = problems.find((x) => x.row === i && x.col === c.id);
              return (
                <div key={c.id} className={`cq-field${c.wide ? ' wide' : ''}${p ? ' bad' : ''}`}>
                  <Label f={c} lang={lang} htmlFor={id} />
                  <Control f={c} id={id} value={r[c.id]} onChange={(v) => set(i, c.id, v)} lang={lang} disabled={disabled} />
                </div>
              );
            })}
          </div>
        </fieldset>
      ))}
      {!disabled && (
        <button type="button" className="cq-add" onClick={() => onChange([...list, {}])}>+ {tr(lang, f.add)}</button>
      )}
    </div>
  );
}

/**
 * The client's questionnaire page (Form 124 + 128): Persian by default with an
 * English switch, answers saved as they type, one confirmation and submit.
 */
export default function ClientQuestionnaire({ token, initial }) {
  const [lang, setLang] = useState('fa');
  const [answers, setAnswers] = useState(initial.answers || {});
  const [status, setStatus] = useState(initial.status);
  const [confirmation, setConfirmation] = useState(initial.confirmation);
  const [save, setSave] = useState('saved');
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState('');
  const [showProblems, setShowProblems] = useState(false);
  const [msg, setMsg] = useState(null);
  const timer = useRef(null);
  const latest = useRef(answers);
  const locked = status === 'submitted';
  const rtl = lang === 'fa';

  useEffect(() => {
    try {
      const saved = localStorage.getItem('cq-lang');
      if (saved === 'en' || saved === 'fa') setLang(saved);
    } catch {
      /* private mode */
    }
  }, []);
  const switchLang = (l) => {
    setLang(l);
    try {
      localStorage.setItem('cq-lang', l);
    } catch {
      /* ignore */
    }
  };

  const persist = async () => {
    setSave('saving');
    try {
      const res = await fetch(`/api/q/${encodeURIComponent(token)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: latest.current }) });
      if (res.status === 409) {
        setStatus('submitted');
        setSave('saved');
        return;
      }
      setSave(res.ok ? 'saved' : 'error');
    } catch {
      setSave('error');
    }
  };
  const change = (id, v) => {
    if (locked) return;
    const next = { ...latest.current, [id]: v };
    latest.current = next;
    setAnswers(next);
    setSave('saving');
    clearTimeout(timer.current);
    timer.current = setTimeout(persist, 700);
  };

  const problems = useMemo(() => clientProblems(answers), [answers]);
  const progress = useMemo(() => clientProgress(answers), [answers]);
  const shown = (f) => (f.show ? f.show(answers) : true);

  async function submit() {
    setMsg(null);
    if (problems.length) {
      setShowProblems(true);
      document.getElementById('cq-problems')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    clearTimeout(timer.current);
    try {
      const res = await fetch(`/api/q/${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ answers: latest.current, agree, name }) });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setStatus('submitted');
      setConfirmation(d.confirmation);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      setMsg(e.message || 'Error');
    }
  }

  const goTo = (p) => {
    const id = p.row != null ? `${p.id}-${p.row}-${p.col}` : p.id;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.focus?.({ preventScroll: true });
    }
  };

  return (
    <div className={`cq${rtl ? ' rtl' : ''}`} dir={rtl ? 'rtl' : 'ltr'} lang={lang}>
      <header className="cq-top">
        <div className="cq-top-inner">
          <div className="cq-brand">Sugimoto Visa</div>
          <div className="cq-langs" role="group" aria-label="Language">
            <button type="button" className={lang === 'fa' ? 'on' : ''} onClick={() => switchLang('fa')} lang="fa">فارسی</button>
            <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => switchLang('en')} lang="en">English</button>
          </div>
        </div>
        {!locked && (
          <div className="cq-progress" aria-label={`${Math.round(progress * 100)}%`}>
            <div style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
      </header>

      <main className="cq-main">
        <h1>{tr(lang, T.title)}</h1>
        {initial.name && <p className="cq-who">{initial.name}</p>}
        {locked ? (
          <div className="cq-banner ok">
            <strong>{tr(lang, T.submitted)}</strong>
            {confirmation && (
              <div className="cq-small">
                {tr(lang, T.submittedBy)}: {confirmation.name} · <span dir="ltr">{new Date(confirmation.at).toLocaleString(lang === 'fa' ? 'fa-IR' : 'en-CA')}</span>
              </div>
            )}
            <div className="cq-small">{tr(lang, T.lockedNote)}</div>
          </div>
        ) : (
          <p className="cq-intro">{tr(lang, T.intro)}</p>
        )}
        {!locked && (
          <div className={`cq-save ${save}`} aria-live="polite">
            {save === 'saving' ? tr(lang, T.saving) : save === 'error' ? tr(lang, T.saveError) : `${tr(lang, T.saved)} · ${lang === 'fa' ? fa(Math.round(progress * 100)) : Math.round(progress * 100)}% ${tr(lang, T.done)}`}
          </div>
        )}

        {CLIENT_SECTIONS.map((s, si) => (
          <section key={s.id} className="cq-card" aria-labelledby={`h-${s.id}`}>
            <h2 id={`h-${s.id}`}>
              <span className="cq-num">{lang === 'fa' ? fa(si + 1) : si + 1}</span> {tr(lang, s)}
            </h2>
            {s.help && <p className="cq-help">{tr(lang, s.help)}</p>}
            <div className="cq-grid">
              {s.fields.filter(shown).map((f) => {
                const p = problems.find((x) => x.id === f.id && x.row == null);
                const bad = showProblems && p;
                const live = !p && answerProblem(f, answers[f.id]);
                if (f.type === 'rows') {
                  return (
                    <div key={f.id} className="cq-field wide" id={f.id}>
                      <Label f={f} lang={lang} />
                      <Rows f={f} value={answers[f.id]} onChange={(v) => change(f.id, v)} lang={lang} disabled={locked} problems={showProblems ? problems.filter((x) => x.id === f.id) : []} />
                      {bad && <div className="cq-err">{tr(lang, p)}</div>}
                    </div>
                  );
                }
                return (
                  <div key={f.id} className={`cq-field${f.wide || f.type === 'textarea' ? ' wide' : ''}${bad ? ' bad' : ''}`}>
                    <Label f={f} lang={lang} htmlFor={f.id} />
                    <Control f={f} id={f.id} value={answers[f.id]} onChange={(v) => change(f.id, v)} lang={lang} disabled={locked} />
                    {live ? <div className="cq-err">{tr(lang, live)}</div> : bad ? <div className="cq-err">{tr(lang, p)}</div> : null}
                  </div>
                );
              })}
            </div>
          </section>
        ))}

        {!locked && (
          <section className="cq-card cq-confirm" aria-labelledby="h-confirm">
            <h2 id="h-confirm">{tr(lang, T.confirmTitle)}</h2>
            {showProblems && problems.length > 0 && (
              <div className="cq-banner warn" id="cq-problems">
                <strong>{tr(lang, T.missingTitle)}</strong>
                <ul>
                  {problems.slice(0, 40).map((p, i) => (
                    <li key={i}><button type="button" className="cq-link" onClick={() => goTo(p)}>{tr(lang, p)}</button></li>
                  ))}
                </ul>
              </div>
            )}
            <label className="cq-agree">
              <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              <span>{CONFIRM_TEXT[lang]}</span>
            </label>
            <div className="cq-field">
              <label className="cq-label" htmlFor="cq-sign">{tr(lang, T.confirmName)}</label>
              <input id="cq-sign" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </div>
            {msg && <div className="cq-err">{msg}</div>}
            <button type="button" className="cq-submit" disabled={!agree || name.trim().length < 3} onClick={submit}>{tr(lang, T.submit)}</button>
            <p className="cq-small">{tr(lang, T.submitNote)}</p>
          </section>
        )}
        <footer className="cq-foot">Sugimoto Visa Inc. · 501 - 3292 Production Way, Burnaby, BC V5A 4R4 · +1 (604) 415-4792 · info@sugimotovisa.com</footer>
      </main>
    </div>
  );
}
