'use client';

import { useLocale } from '@/components/providers';

export default function ErrorPage() {
  const { text } = useLocale();
  return (
    <main className="mx-auto flex min-h-[70dvh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold">{text.staleClient}</h1>
      <p className="text-gray-600">{text.staleClientDescription}</p>
      <button className="button button-primary" type="button" onClick={() => window.location.reload()}>{text.refresh}</button>
    </main>
  );
}
