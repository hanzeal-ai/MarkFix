import {
  createHash,
  createHmac,
  randomBytes,
  scrypt as nodeScrypt,
  timingSafeEqual,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(nodeScrypt);
const passwordVersion = 'scrypt-v1';

export type AccessClaims = {
  sub: string;
  sid: string;
  exp: number;
};

const encode = (value: string): string => Buffer.from(value).toString('base64url');

export const hashOpaqueToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const createOpaqueToken = (): string => randomBytes(32).toString('base64url');

export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16);
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `${passwordVersion}$${salt.toString('base64url')}$${derived.toString('base64url')}`;
};

export const verifyPassword = async (password: string, stored: string): Promise<boolean> => {
  const [version, saltValue, expectedValue] = stored.split('$');
  if (version !== passwordVersion || !saltValue || !expectedValue) return false;
  const expected = Buffer.from(expectedValue, 'base64url');
  const actual = (await scrypt(
    password,
    Buffer.from(saltValue, 'base64url'),
    expected.length,
  )) as Buffer;
  return expected.length === actual.length && timingSafeEqual(expected, actual);
};

export const signAccessToken = (claims: AccessClaims, secret: string): string => {
  const payload = encode(JSON.stringify(claims));
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `mf1.${payload}.${signature}`;
};

export const verifyAccessToken = (
  token: string,
  secret: string,
  now = Date.now(),
): AccessClaims => {
  const [version, payload, signature] = token.split('.');
  if (version !== 'mf1' || !payload || !signature) throw new Error('Malformed access token');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new Error('Invalid access token signature');
  }
  const claims = JSON.parse(
    Buffer.from(payload, 'base64url').toString('utf8'),
  ) as Partial<AccessClaims>;
  if (
    typeof claims.sub !== 'string' ||
    typeof claims.sid !== 'string' ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 <= now
  ) {
    throw new Error('Expired or invalid access token');
  }
  return claims as AccessClaims;
};
