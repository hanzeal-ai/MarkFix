import { rm } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { mkdir, readFile, writeFile, rename, unlink, chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';

export const stateDirectory = () => process.env.MARKFIX_CLI_HOME ?? join(homedir(), '.markfix');
export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}
export async function writeJson(path, value) {
  const temp = `${path}.${randomUUID()}.tmp`;
  await writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600, flag: 'wx' });
  await rename(temp, path);
}
export async function initializeStorage() {
  const directory = stateDirectory();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await chmod(directory, 0o700);
  return directory;
}
function security(command) {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/security', ['-i'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (data) => {
      output += data;
    });
    child.stderr.resume();
    child.on('error', () => reject(new Error('System credential store is unavailable')));
    child.on('exit', (code) =>
      code === 0
        ? resolve(output.trim())
        : reject(new Error('System credential store refused access')),
    );
    child.stdin.end(`${command}\n`);
  });
}
const serviceName = (server) =>
  `markfix-cli-${createHash('sha256').update(server).digest('hex').slice(0, 24)}`;
export async function saveCredential(config, value) {
  if (config.credentialStore === 'keychain') {
    // Pass credential through stdin, never shell interpolation or process arguments.
    await security(
      `add-generic-password -U -a markfix-cli -s ${serviceName(config.server)} -w ${Buffer.from(JSON.stringify(value)).toString('base64')}`,
    );
  } else await writeJson(join(stateDirectory(), 'credential.json'), value);
}
export async function loadCredential(config) {
  if (config.credentialStore === 'keychain') {
    const value = await security(
      `find-generic-password -a markfix-cli -s ${serviceName(config.server)} -w`,
    );
    return JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
  }
  return readJson(join(stateDirectory(), 'credential.json'), null);
}
export async function removeCredential(config) {
  if (config.credentialStore === 'keychain')
    await security(`delete-generic-password -a markfix-cli -s ${serviceName(config.server)}`);
  else
    await unlink(join(stateDirectory(), 'credential.json')).catch((error) => {
      if (error.code !== 'ENOENT') throw error;
    });
}

export async function withInstallationLock(operation) {
  const directory = await initializeStorage();
  const path = join(directory, 'command.lock');
  for (let attempt = 0; ; attempt++) {
    try {
      await mkdir(path);
      await writeFile(join(path, 'pid'), String(process.pid), { mode: 0o600 });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      try {
        const pid = Number(await readFile(join(path, 'pid'), 'utf8'));
        if (pid > 0) process.kill(pid, 0);
      } catch (cause) {
        if (cause.code === 'ESRCH') {
          await rm(path, { recursive: true });
          continue;
        }
      }
      if (attempt >= 60)
        throw new Error('Another MarkFix command is running; retry when it finishes', {
          cause: error,
        });
      await delay(1000);
    }
  }
  try {
    return await operation();
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}
