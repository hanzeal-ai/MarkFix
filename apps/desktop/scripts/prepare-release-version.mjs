import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath, URL } from 'node:url';

const run = Number(process.argv[2]);
if (!/^\d+$/.test(process.argv[2] ?? '') || !Number.isSafeInteger(run) || run <= 0)
  throw new Error('Expected a positive CI release run number');
const path = process.argv[3] ?? fileURLToPath(new URL('../package.json', import.meta.url));
const metadata = JSON.parse(readFileSync(path, 'utf8'));
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(metadata.version);
if (!match) throw new Error('Expected a stable desktop base version');
// Both platform jobs use the same workflow run number. The installed app and
// download manifest then read this exact package version, not a second policy.
const patch = Number(match[3]) + run;
if (!Number.isSafeInteger(patch)) throw new Error('Release version is too large');
metadata.version = `${match[1]}.${match[2]}.${patch}`;
writeFileSync(path, JSON.stringify(metadata, null, 2) + '\n');
process.stdout.write(`Desktop release version: ${metadata.version}\n`);
