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

The check creates and removes its own workspace and temporary artifact directory. It verifies candidate/finalize interleaving, two cleanup workers, filesystem deletion failure, a late upload orphan, dry-run, both reference protections, repeat repair, concurrent legacy migration, rollback after failed report creation, and invalid provenance rejection. Its filesystem failure check requires a non-root POSIX user so directory permissions are enforced. Do not run it against a shared or production database.

The unit tests additionally verify that a later database query failure causes zero removals, unknown names/symlinks are ignored, and partial filesystem failures are reported.

## Legacy annotation migration

The existing startup migration remains for databases containing `ManagedAnnotation` records. Each source row is now claimed with conditional `deleteMany` inside the same transaction that creates its Report and finalized submission. A rollback restores the source row. A competing worker must find a matching project and `commercial:<reportId>` submission provenance before treating a lost claim as already migrated; missing/mismatched output fails closed.

Maintain this compatibility path until supported databases have no standalone or mirror `ManagedAnnotation` rows and deployment owners confirm no legacy producer remains. The API maintainers own this removal criterion. Moving it into a dedicated upgrade command is a future lifecycle change, not part of this patch. No database schema migration is introduced here.
