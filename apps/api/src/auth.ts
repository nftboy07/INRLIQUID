import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const uuid = z.string().uuid();

function b64url(input: string) { return Buffer.from(input, 'base64url'); }

export function authenticateRequest(request: { headers: Record<string, string | string[] | undefined> }) {
  if (process.env.ALLOW_DEV_USER_HEADER === 'true') {
    const dev = request.headers['x-user-id'];
    if (typeof dev === 'string' && uuid.safeParse(dev).success) return dev;
  }
  const secret = process.env.AUTH_HMAC_SECRET;
  const header = request.headers.authorization;
  if (!secret || typeof header !== 'string' || !header.startsWith('Bearer ')) throw new Error('AUTH_REQUIRED');
  const token = header.slice(7).trim();
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('AUTH_INVALID_TOKEN');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const expected = createHmac('sha256', secret).update(`${encodedHeader}.${encodedPayload}`).digest();
  const supplied = b64url(encodedSignature);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) throw new Error('AUTH_INVALID_TOKEN');
  let payload: { sub?: unknown; exp?: unknown; iss?: unknown };
  try { payload = JSON.parse(b64url(encodedPayload).toString('utf8')); } catch { throw new Error('AUTH_INVALID_TOKEN'); }
  if (payload.iss !== undefined && payload.iss !== (process.env.AUTH_ISSUER ?? 'inrliquid')) throw new Error('AUTH_INVALID_TOKEN');
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) throw new Error('AUTH_TOKEN_EXPIRED');
  if (typeof payload.sub !== 'string' || !uuid.safeParse(payload.sub).success) throw new Error('AUTH_INVALID_SUBJECT');
  return payload.sub;
}

export function productionAuthConfigured() {
  return Boolean(process.env.AUTH_HMAC_SECRET) && process.env.ALLOW_DEV_USER_HEADER !== 'true';
}
