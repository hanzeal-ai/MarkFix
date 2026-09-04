# MarkFix

**Mark it. Fix it.** MarkFix is a macOS website feedback tool with a Word-like comment rail: open a site, select a DOM element or visual region, add context, capture the visible page, and submit a report to a collaborative web dashboard.

## Implemented vertical slice

- Electron `BrowserWindow` shell with an isolated website `WebContentsView`
- CDP inspect mode with persistent element snapshots and region fallback
- Closed Shadow DOM SVG overlay and visible-page capture
- Local SQLite draft persistence
- Idempotent submission, SHA-256 artifact verification, PostgreSQL/Prisma report storage
- Dashboard report list/detail, comments, and optimistic status transitions
- Multi-workspace and project selection with owner/admin-managed project and environment settings
- Verified-email accounts, rotating sessions, revocation, and workspace role enforcement
- Single-use password recovery with session revocation and a provider-neutral email webhook port
- HttpOnly dashboard cookies and operating-system-encrypted desktop refresh credentials
- Server-driven desktop compatibility checks with mandatory-upgrade submission blocking
- Background cleanup worker and compatibility test page

## Run locally

Requirements: Node 24, pnpm 10.33, Docker Desktop.

```bash
pnpm install
docker compose -f infra/compose.yaml up postgres minio -d
cp apps/api/.env.example apps/api/.env
set -a && source apps/api/.env && set +a
pnpm --filter @markfix/database db:push
pnpm --filter @markfix/api dev
```

In separate terminals:

```bash
pnpm --filter @markfix/dashboard dev
pnpm --filter @markfix/desktop dev
pnpm --filter @markfix/testkit dev
```

Dashboard: <http://localhost:4311>. Compatibility lab: <http://localhost:4312> (enable local HTTP with `MARKFIX_ALLOW_HTTP=true` when launching desktop).

The local environment seeds the username `admin` with password `admin` (stored internally as
`admin@markfix.local`). Remove `MARKFIX_DEMO_PASSWORD` outside local development. New local
dashboard registrations are verified inline; production deployments must connect the generated
verification token to their email delivery provider.

## Validation

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Production signing, notarization, hosted S3 credentials, email identity flows, and release-channel infrastructure require organization-owned external credentials and are intentionally not represented as completed by local source code.
