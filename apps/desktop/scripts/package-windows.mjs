import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import process from 'node:process';
import { serviceUrls } from '../../../packages/contracts/src/service-config.ts';
import { windowsDesktopUpdateFeedUrl } from '../src/desktop-update.ts';

const require = createRequire(import.meta.url);
const feed = windowsDesktopUpdateFeedUrl(
  serviceUrls('production', process.env.MARKFIX_SERVICE_ORIGIN).apiOrigin,
);
// electron-builder writes app-update.yml (including updaterCacheDirName) into resources.
execFileSync(
  process.execPath,
  [
    require.resolve('electron-builder/cli.js'),
    '--win',
    'nsis',
    '--x64',
    '--publish',
    'never',
    '--config.publish.provider=generic',
    `--config.publish.url=${feed}`,
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit' },
);
