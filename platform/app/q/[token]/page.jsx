import { appForToken, clientView } from '@/lib/clientLinks';
import ClientQuestionnaire from '@/components/ClientQuestionnaire';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'پرسشنامه متقاضی · Applicant questionnaire — Sugimoto Visa', robots: { index: false, follow: false } };

const MSG = {
  invalid: ['این لینک معتبر نیست. لطفاً از کارشناس پرونده خود لینک جدید بخواهید.', 'This link is not valid. Please ask your case officer for a new one.'],
  revoked: ['این لینک دیگر فعال نیست. لطفاً لینک جدید را از کارشناس پرونده خود بخواهید.', 'This link is no longer active. Please ask your case officer for the new one.'],
  expired: ['اعتبار این لینک تمام شده است. لطفاً از کارشناس پرونده خود لینک جدید بخواهید.', 'This link has expired. Please ask your case officer for a new one.'],
};

/** The client's questionnaire, opened with their personal link — no account needed. */
export default async function ClientQuestionnairePage({ params }) {
  const { app, error } = await appForToken(params.token);
  return (
    <>
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&display=swap" />
      {error ? (
        <div className="cq rtl" dir="rtl" lang="fa">
          <main className="cq-main">
            <div className="cq-card">
              <h1>Sugimoto Visa</h1>
              <p>{MSG[error]?.[0]}</p>
              <p dir="ltr" lang="en" style={{ textAlign: 'left' }}>{MSG[error]?.[1]}</p>
            </div>
          </main>
        </div>
      ) : (
        <ClientQuestionnaire token={params.token} initial={clientView(app)} />
      )}
    </>
  );
}
