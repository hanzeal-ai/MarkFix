import { createHash } from 'node:crypto';
import { createReadStream, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { serviceUrls } from '../../../packages/contracts/src/service-config.ts';

const [directory, platform, distribution, commit] = process.argv.slice(2);
if (
  !directory ||
  !['windows', 'macos'].includes(platform) ||
  !['trial', 'signed'].includes(distribution) ||
  !/^[a-f0-9]{40}$/.test(commit ?? '')
) {
  throw new Error('Expected output directory, windows|macos, trial|signed and commit SHA');
}
const version = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Expected a stable desktop version');
const origin = serviceUrls('production', process.env.MARKFIX_SERVICE_ORIGIN).origin;
if (!origin.startsWith('https://')) throw new Error('Public downloads require HTTPS');
const arch = platform === 'windows' ? 'x64' : 'arm64';
const names =
  platform === 'windows'
    ? [`MarkFix-${version}-windows-x64-setup.exe`]
    : [
        `MarkFix-${version}-arm64.dmg`,
        ...(distribution === 'signed' ? [`MarkFix-${version}-arm64.zip`] : []),
      ];
const files = [];
for (const name of names) {
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of createReadStream(join(directory, name))) {
    hash.update(chunk);
    size += chunk.length;
  }
  if (!size) throw new Error(`Empty package: ${name}`);
  files.push({ name, size, sha256: hash.digest('hex') });
}
writeFileSync(
  join(directory, 'download-manifest.json'),
  JSON.stringify(
    { schemaVersion: 1, platform, arch, distribution, version, commit, origin, files },
    null,
    2,
  ) + '\n',
);
writeFileSync(
  join(directory, 'SHA256SUMS.txt'),
  files.map((file) => `${file.sha256}  ${file.name}\n`).join(''),
);
