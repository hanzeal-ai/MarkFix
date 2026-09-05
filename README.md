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

The API, worker, database, website, management dashboard, and compatibility lab run in Docker.
Docker Desktop with Compose v2 or newer is the only requirement for the local service stack.

```bash
docker compose up --build -d
docker compose ps
```

- Website and management dashboard: <http://localhost:4311>
- API health check: <http://localhost:4310/v1/health>
- Compatibility lab: <http://localhost:4312>

Follow logs or stop the complete stack with:

```bash
docker compose logs -f
docker compose down
```

Electron uses macOS windowing, keychain, and capture APIs and therefore remains a native process.
Only desktop development requires Node 24 and pnpm 11.25 after the Docker stack is healthy:

```bash
pnpm install
MARKFIX_ALLOW_HTTP=true pnpm dev:desktop
```

The local environment seeds the email `admin@markfix.local` with password `markfix-admin`. Remove
`MARKFIX_DEMO_PASSWORD` outside local development. New local
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
