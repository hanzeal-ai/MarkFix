# MarkFix Vibe Coding review checklist

Use this checklist for full-project reviews. Reconcile it with the discovery sources before each review; a passing build or unit test is not visual evidence.

Record the reviewed revision, runtime mode, viewport, identity or role, and evidence for every item. Use only: **verified**, **partially verified**, **unverified**, or **blocked**.

## Discovery sources

- Desktop renderer entries: `apps/desktop/src/renderer/src/main.tsx`
- Desktop child windows: `apps/desktop/src/main/child-window-manager.ts`
- Dashboard route classification: `apps/dashboard/src/routes.ts`
- Public and application routes: `apps/dashboard/src/WebRoot.tsx`

Any surface found there but missing below must be added before concluding the review.

## Desktop surfaces

- Main annotation workspace: browse, element comment, screenshot, diagnostics, loading, empty, failure, and permission states.
- Settings: General and Subscription sections.
- Annotation save review.
- Capture preview.
- Global annotation history.
- Project annotation history.

## Dashboard surfaces

- Public pages: home, docs, pricing, download, privacy, and terms.
- Account flows: login, registration, email verification, forgotten/reset password, invitation acceptance, and account settings.
- Application: overview, projects, users, project drawer, annotation detail/editor, loading, empty, failure, read-only, and administrator states.

## Cross-flow checks

- Repeated titles, descriptions, and primary actions do not duplicate information already established by the title bar, navigation, or current selection.
- Child windows are reopened, or the desktop process is restarted, after renderer changes so the inspected UI matches the current source.
- Element and screenshot annotations survive scrolling, route changes, save/review, replay, and per-page isolation.
- Direct routes and API calls enforce the same authentication, role, workspace, and project boundaries as the visible UI.

## Exit rule

A full-project review cannot conclude **Accept** while a discovered user-facing surface is unverified. Report the skipped surface and why; use **Conditionally accept**, **Require changes**, or **Blocked** as supported by the evidence.
