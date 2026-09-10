import { lstat, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';

export async function localConnection() {
  const path =
    process.env.MARKFIX_LOCAL_AGENT_FILE ?? join(homedir(), '.markfix-desktop', 'agent.json');
  let stat;
  try {
    stat = await lstat(path);
  } catch {
    throw new Error('Start MarkFix desktop before using --local');
  }
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid()))
  )
    throw new Error('Unsafe local agent discovery file');
  const data = JSON.parse(await readFile(path, 'utf8'));
  const url = new URL(data.origin);
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    !/^[a-f0-9]{64}$/.test(data.secret) ||
    !/^[a-f0-9-]{36}$/.test(data.identity)
  )
    throw new Error('Invalid local agent discovery');
  return {
    server: `local://${data.identity}`,
    endpoint: url.origin,
    localSecret: data.secret,
    local: true,
  };
}
