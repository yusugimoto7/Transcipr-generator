import { json } from '@/lib/api';

// Health check used by the hosting platform (Render healthCheckPath).
export async function GET() {
  return json({ ok: true, service: 'canada-visa-platform' });
}
