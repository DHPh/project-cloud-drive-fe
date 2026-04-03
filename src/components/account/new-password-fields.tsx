'use client';

import { useId } from 'react';
import { useLocale } from '../providers';

export function readNewPassword(data: FormData) {
  const password = String(data.get('password') ?? '');
  if (password !== data.get('confirmPassword')) return { error: 'mismatch' } as const;
  const length = [...password].length;
  return length >= 12 && length <= 1024 ? { password } as const : { error: 'length' } as const;
}

export function NewPasswordFields({ disabled }: { disabled: boolean }) {
  const { text } = useLocale();
  const id = useId();
  return (
    <>
      <label className="block space-y-1 text-sm font-medium">{text.newPassword}
        <input data-testid="new-password" name="password" type="password" autoComplete="new-password" className="field" disabled={disabled} aria-describedby={`${id}-requirements`} required maxLength={2048} />
      </label>
      <p id={`${id}-requirements`} className="text-xs text-ink-muted">{text.passwordRequirements}</p>
      <label className="block space-y-1 text-sm font-medium">{text.confirmPassword}
        <input data-testid="confirm-password" name="confirmPassword" type="password" autoComplete="new-password" className="field" disabled={disabled} required maxLength={2048} />
      </label>
    </>
  );
}
