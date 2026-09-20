# MarkFix project instructions

## Product boundary

- MarkFix provides Word-like element comments and screenshot markup on arbitrary websites.
- Preserve direct on-page selection, developer reproduction context, per-page isolation, and saved annotation replay.
- Treat local demonstration capabilities and production-ready capabilities as separate states.

## Authoritative sources

- Shared API and data shapes belong in `packages/contracts`.
- Persistent server data is defined by `packages/database/prisma/schema.prisma`.
- Electron target-page isolation follows `docs/security/browser-boundary.md` and `docs/adr/0001-target-overlay.md`.
- Do not create a second independently evolving copy of permissions, report states, or annotation contracts.

## Engineering boundaries

- Use Node 24 and the pnpm version declared by the root `packageManager` field.
- Keep remote website content sandboxed with no Node integration or generic IPC bridge.
- Route every target-page navigation path through the shared HTTP/HTTPS policy. Other website URL schemes remain blocked.
- Treat `docker compose` and `prisma db push` as local-development tooling, not as a production migration strategy.
- Do not edit generated `dist`, `out`, or Prisma client output.
- Adding dependencies, migrating data, committing, pushing, deploying, and publishing are separate authorization boundaries.

## Verification

- Run the smallest relevant test first, then `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build` before delivery.
- UI assertions must test behavior. Source-string checks may supplement but must not be the only evidence for a user flow.
- A full-project or Vibe Coding audit must follow `docs/vibe-review-checklist.md`, visually inspect every discovered user-facing surface, and list any skipped surface as unverified.
- After renderer changes, reopen the affected Electron child window or restart the development process before accepting visual evidence.
- Changes to annotation positioning or review behavior require a real Electron smoke test covering scrolling, route changes, replay, and per-page isolation.
- Scope visual verification to affected surfaces and behaviors. A routine change does not trigger a full-product visual audit; reuse passing evidence when the relevant code, build, and fixture are unchanged.
- Separate marketing asset capture from behavioral smoke tests. Capture marketing images once after the target UI is stable; routine smoke reruns should use behavioral assertions and logs, with screenshots only for changed visual acceptance points or a new failure that needs visual diagnosis. Do not repeatedly regenerate an unchanged screenshot set.
- After a verification failure, inspect the assertion, logs, fixture, and existing failure image before rerunning. State the new evidence or specific fix and rerun the smallest failing scenario first. Expand to the required regression coverage only when that scenario passes or the evidence identifies a broader impact. After two failures on the same path without new evidence, stop repeating it and report the blocker or choose an evidence-backed alternative.
- Run Electron UI suites sequentially when they share application locks or desktop input. Confirm the previous test process has exited before starting the next; only stop processes created by the current task.
- Security changes require negative-path tests. Data changes require migration, rollback or forward-repair, and invariant evidence.

## Delivery

- Keep unrelated user changes intact and inspect the final diff.
- Report verified, partially verified, unverified, and blocked results separately.
- Do not claim signing, notarization, hosted storage, email delivery, production migration, or deployment without target-environment evidence.
