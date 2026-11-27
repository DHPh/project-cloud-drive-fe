# Cloud Drive — Frontend

Next.js App Router frontend for Cloud Drive, a file storage, sharing, and public-board web application deployed on Vercel and backed by [`project-cloud-drive-be`](https://github.com/DHPh/project-cloud-drive-be).

- **Live App:** [cloud.dhpham.dev](https://cloud.dhpham.dev)
- **Public Boards (no sign-in required):** [cloud.dhpham.dev/explore](https://cloud.dhpham.dev/explore)
- **Backend Repository:** [DHPh/project-cloud-drive-be](https://github.com/DHPh/project-cloud-drive-be)

## Key Features

- **Drive Workspace:** Nested folder hierarchy, breadcrumb target picker for moving files and folders, global Drive search, Activity Timeline, paginated listings, keyboard shortcuts, dark/light theme, and bilingual EN/VI UI.
- **File Workflows:** File uploads, inline previews (images, PDFs via `pdfjs-dist`, and bounded text/Markdown), single-file streaming downloads, multi-item ZIP downloads, renaming, and Trash with restore.
- **Sharing & Public Boards:** Per-account viewer and editor grants with expiration, inherited folder permissions, share management, link and QR code sharing, and public read-only boards at `/explore`.
- **Account & Admin:** Cookie-backed sessions, invite-based onboarding, and admin views gated by backend-verified permissions.

## Architecture & Tech Stack

- **Stack:** Next.js 16 (App Router), React 19, TypeScript 5.9, Tailwind CSS, Radix UI Dialog, Heroicons, `pdfjs-dist`, `qrcode`, Playwright + `@axe-core/playwright`.
- **Same-Origin `/api/v1` Proxy:** Next.js rewrites forward browser `/api/v1/*` requests to `CLOUD_DRIVE_API_ORIGIN`, keeping `HttpOnly` session cookies first-party while SSR verifies active sessions against the backend.
- **Contract-Driven API Types:** `src/lib/api-schema.d.ts` is generated from `docs/contracts/openapi.yaml` via `openapi-typescript` and validated in CI/local checks with `npm run check:api`.

```text
Browser ──▶ Vercel (Next.js App Router + /api/v1 rewrite) ──▶ Cloudflare Tunnel ──▶ Linux VPS (Express + PostgreSQL 17 + MinIO)
```

## Documentation

- [UX Design](docs/ux.md)
- [OpenAPI Contract](docs/contracts/openapi.yaml)
- [Contract Notes](docs/contracts/README.md)

## Local Development

Requires **Node.js 24** (`>=24 <25`) and the backend running locally (run `npm run db:setup` in `project-cloud-drive-be` first to prepare synthetic fixtures).

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:3000`. By default, Next.js proxies `/api/v1` to `http://127.0.0.1:3001`. Copy `.env.example` to `.env.local` to override `CLOUD_DRIVE_API_ORIGIN`, and keep the backend `APP_ORIGIN` setting aligned with the frontend origin.

## OpenAPI Contract Sync

The backend repository maintains the canonical `docs/contracts/openapi.yaml`. Copy the matching OpenAPI spec into `docs/contracts/openapi.yaml` here, run `npm run generate:api` to regenerate `src/lib/api-schema.d.ts`, and verify sync with `npm run check:api`.

## Verification & E2E Testing

```sh
npm run check:api
npm run lint
npm run typecheck
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

Playwright targets `PLAYWRIGHT_BASE_URL` (defaults to `http://127.0.0.1:3000`) and writes HTML reports to `playwright-report/`. Admin E2E scenarios require `PLAYWRIGHT_ADMIN_EMAIL` and `PLAYWRIGHT_ADMIN_PASSWORD` matching a bootstrapped admin on the test backend. For full acceptance runs across browser configurations, isolate test databases/buckets per run and invoke projects individually, e.g.:

```sh
node node_modules/@playwright/test/cli.js test --project=chromium-desktop
```

## Vercel Deployment

1. Import the repository with the **Next.js** preset, root directory at the repository root, **Node.js 24.x**, `npm ci` install command, and `npm run build`.
2. Set `CLOUD_DRIVE_API_ORIGIN` to the backend HTTPS origin (redeploy after changing it so Next.js rewrites update).
3. Configure `APP_ORIGIN` on the backend to include the deployed frontend origin (the backend supports one or more comma-separated allowed HTTPS origins).
4. After deployment, verify sign-in, reloading `/drive` (SSR), small and near-limit uploads (accounting for Vercel external rewrite timeout limits), Unicode renaming, file download, and sign-out.
