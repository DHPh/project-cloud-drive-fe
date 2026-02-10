import 'server-only';
import { cookies } from 'next/headers';
import { ApiError, type User } from './api';
import type { operations } from './api-schema';

const sessionCookie = 'cloud_drive_session';
type SessionResponse = operations['getCurrentUser']['responses'][200]['content']['application/json'];

export async function readServerUser(): Promise<User | null> {
  const value = (await cookies()).get(sessionCookie)?.value;
  if (!value || !/^[\w.-]+$/.test(value)) return null;

  const origin = process.env.CLOUD_DRIVE_API_ORIGIN || 'http://127.0.0.1:3001';
  const response = await fetch(new URL('/api/v1/auth/me', origin), {
    cache: 'no-store',
    headers: { Cookie: `${sessionCookie}=${value}` },
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new ApiError(response.status, 'SESSION_UNAVAILABLE');
  const payload: SessionResponse = await response.json();
  return payload.data;
}
