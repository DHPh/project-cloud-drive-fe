'use client';

import './globals.css';

export default function GlobalError() {
  return (
    <html lang="vi">
      <body>
        <main className="mx-auto flex min-h-[70dvh] max-w-lg flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-xl font-semibold">Không mở được Cloud Drive</h1>
          <p className="text-ink-secondary">Tải lại trang để thử lại.</p>
          <button className="button button-primary" type="button" onClick={() => window.location.reload()}>Tải lại</button>
        </main>
      </body>
    </html>
  );
}
