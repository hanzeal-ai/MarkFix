import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { PrismaClient } from '@markfix/database';

// Offline maintenance only: all API instances and artifact writers must be stopped.
export async function repairOrphanArtifacts(
  database: Pick<PrismaClient, 'artifact' | 'report'>,
  directory: string,
  apply = false,
) {
  const entries = await readdir(directory, { withFileTypes: true });
  const candidates: string[] = [];
  const preserved: string[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}\.png$/i.test(entry.name))
      continue;
    const id = entry.name.slice(0, -4);
    const artifact = await database.artifact.findUnique({ where: { id }, select: { id: true } });
    const report = await database.report.findFirst({
      where: { screenshotPath: id },
      select: { id: true },
    });
    (artifact || report ? preserved : candidates).push(entry.name);
  }
  // Complete all database checks before deleting anything; query failure is fail-closed.
  const removed: string[] = [];
  const failed: Array<{ file: string; error: string }> = [];
  if (apply) {
    for (const file of candidates) {
      try {
        await rm(join(directory, file), { force: true });
        removed.push(file);
      } catch (error) {
        failed.push({ file, error: error instanceof Error ? error.message : String(error) });
      }
    }
  }
  return { apply, candidates, preserved, removed, failed };
}
