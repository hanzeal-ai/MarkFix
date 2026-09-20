# Artifact cleanup recovery

## Scope and invariants

Expired submission cleanup conditionally deletes the database submission before removing its PNG. A concurrent finalized submission wins the database predicate and retains its image. Database failure leaves the file intact.

This is not an atomic database/filesystem transaction. A failed `rm`, process termination, or an upload already in flight can leave an unreferenced PNG. These are storage leaks, not automatically retried cleanup records. Use the offline forward-repair command below. It never creates or repairs a missing referenced screenshot.

The repair preserves a file whenever **either** `Artifact.id` or `Report.screenshotPath` references its UUID. Only regular files named exactly `UUID.png` are candidates; symlinks and other files are ignored. All database checks finish before the first removal, so a query failure deletes nothing. A removal failure is listed in `failed` and makes the command exit nonzero; already missing files are harmless on retry.

## Offline operation

1. Obtain separate authorization for the target environment and deletion. Stop every API instance, hourly cleanup worker, upload process, and other writer of the artifact directory. Wait for in-flight work to finish. The `--writers-stopped` flag is an operator acknowledgement, not automatic process detection. Keep writers stopped through both checks and deletion.
2. Back up the directory and database together. Set explicit `DATABASE_URL` and absolute `ARTIFACT_DIR` for that same environment. Use Node 24 and the repository pnpm version. The command refuses implicit environment defaults.
3. From the repository root, preview candidates:

   ```sh
   pnpm --filter @markfix/api exec tsx scripts/repair-orphan-artifacts.ts
   ```

4. Review `candidates` and `preserved`. After target-specific deletion approval, run:

   ```sh
   pnpm --filter @markfix/api exec tsx scripts/repair-orphan-artifacts.ts --apply --writers-stopped
   ```

5. If `failed` is nonempty, correct the filesystem issue and repeat while writers remain stopped. Run dry-run again: `candidates` must be empty for the recognized regular files; every previously referenced file must remain. Resume the API and open a saved report screenshot. Retain output and backup with the maintenance record.

If the environment or directory was wrong, do not resume writes; restore from the paired backup. No production cleanup, deployment, or rollback is authorized by the existence of this document.

## Reproducible verification

Use a disposable PostgreSQL 18 database on `127.0.0.1`, named `audit`, with no workspaces. Apply the checked-in Prisma migration to that disposable database, set `TEST_DATABASE_URL` to its URL, then run:

```sh
pnpm --filter @markfix/api exec tsx scripts/verify-maintenance.ts
```

The check creates and removes its own project and temporary artifact directory. It verifies candidate/finalize interleaving, two cleanup workers, filesystem deletion failure, a late upload orphan, dry-run, both reference protections, repeat repair, Report creation and rollback after failed creation. Its filesystem failure check requires a non-root POSIX user so directory permissions are enforced. Do not run it against a shared or production database.

The unit tests additionally verify that a later database query failure causes zero removals, unknown names/symlinks are ignored, and partial filesystem failures are reported.

## Current annotation storage

Report is the only annotation source. API startup no longer reads or converts ManagedAnnotation records. Migration `20260917000000_remove_managed_annotations` removes the retired table and enums only when the table is empty; if any row remains, the transaction fails without changing data. Review and reconcile those records in a separately authorized maintenance operation before deployment. Historical Prisma migrations remain immutable.

The same migration requires captureBundle v2 in Report and ReportSubmission, rejects retired drawing fields, and installs CHECK constraints that reject subsequent old producer writes. It also rejects old Activity states, project workspaceId, and record/batch annotations missing current page, capture, or runtime evidence. Every guard runs in the same transaction; rejection preserves rows. See [current contracts](current-contract.md).
