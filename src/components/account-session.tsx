'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, currentUser, logout, type User } from '@/lib/api';
import { localizedError } from '@/lib/messages';
import { publishSessionChange, subscribeToSessionChanges } from '@/lib/session-events';
import { LoginForm } from './login-form';
import { Overlay } from './overlay';
import { useLocale } from './providers';

export function useAccountSession(initialUser: User, activeUrl: string) {
  const queryClient = useQueryClient();
  const { text } = useLocale();
  const [user, setUser] = useState(initialUser);
  const [expired, setExpired] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const signOutLock = useRef(false);

  const expire = useCallback(() => setExpired(true), []);

  useEffect(() => subscribeToSessionChanges(() => {
    void queryClient.cancelQueries().finally(() => {
      queryClient.clear();
      window.location.reload();
    });
  }), [queryClient]);

  useEffect(() => {
    const accountCheck = new AbortController();
    void currentUser(accountCheck.signal).then((checked) => {
      if (checked.id !== user.id) window.location.reload();
    }).catch((error: unknown) => {
      if (error instanceof ApiError && error.status === 401) expire();
    });
    return () => accountCheck.abort();
  }, [expire, user.id]);

  async function reauthenticate(nextUser: User) {
    await queryClient.cancelQueries();
    queryClient.clear();
    if (nextUser.id !== user.id) {
      publishSessionChange();
      window.location.replace(activeUrl);
      return;
    }
    setUser(nextUser);
    setExpired(false);
  }

  async function signOut() {
    if (signOutLock.current) return;
    signOutLock.current = true;
    setSigningOut(true);
    setSignOutError(null);
    try {
      await logout();
      await queryClient.cancelQueries();
      queryClient.clear();
      publishSessionChange();
      window.location.replace('/login');
    } catch (error) {
      setSignOutError(localizedError(error, text));
    } finally {
      signOutLock.current = false;
      setSigningOut(false);
    }
  }

  const sessionDialog = expired && (
    <Overlay title={text.sessionTitle} description={text.sessionDescription}>
      <LoginForm email={user.email} onSuccess={reauthenticate} className="min-h-0 overflow-y-auto p-5 sm:p-6" />
    </Overlay>
  );

  return { user, expired, expire, signingOut, signOutError, signOut, sessionDialog };
}
