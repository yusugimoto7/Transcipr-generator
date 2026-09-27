import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import AuthForm from '@/components/AuthForm';

export const metadata = { title: 'Create account — Sugimoto Visa' };

export default async function RegisterPage() {
  const user = await getCurrentUser();
  if (user) redirect('/dashboard');
  return <AuthForm mode="register" />;
}
