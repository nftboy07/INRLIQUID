import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import { encryptSecret } from './token-crypto.js';

function config() {
  const clientId = process.env.UPSTOX_CLIENT_ID;
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI;
  const secret = process.env.AUTH_HMAC_SECRET;
  if (!clientId || !clientSecret || !redirectUri || !secret) throw new Error('UPSTOX_OAUTH_NOT_CONFIGURED');
  return { clientId, clientSecret, redirectUri, secret };
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function signState(userId: string): string {
  const { secret } = config();
  const payload = base64url(JSON.stringify({ sub: userId, exp: Math.floor(Date.now() / 1000) + 600 }));
  const signature = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

export function verifyUpstoxOAuthState(state: string): string {
  const { secret } = config();
  const [payload, encodedSignature] = state.split('.');
  if (!payload || !encodedSignature) throw new Error('INVALID_OAUTH_STATE');
  const expected = Buffer.from(createHmac('sha256', secret).update(payload).digest('base64url'));
  const received = Buffer.from(encodedSignature);
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new Error('INVALID_OAUTH_STATE');
  const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string; exp?: number };
  if (!parsed.sub || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) throw new Error('EXPIRED_OAUTH_STATE');
  return parsed.sub;
}

export function createUpstoxAuthorizationUrl(userId: string): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirectUri, state: signState(userId) });
  return `https://api.upstox.com/v2/login/authorization/dialog?${params.toString()}`;
}

export async function exchangeUpstoxCode(pool: Pool, code: string, state: string): Promise<{ userId: string; providerUserId: string }> {
  const userId = verifyUpstoxOAuthState(state);
  const { clientId, clientSecret, redirectUri } = config();
  const response = await fetch('https://api.upstox.com/v2/login/authorization/token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(10000),
  });
  const payload = await response.json() as Record<string, unknown>;
  if (!response.ok || typeof payload.access_token !== 'string' || typeof payload.user_id !== 'string') {
    throw new Error(`UPSTOX_TOKEN_EXCHANGE_FAILED:${response.status}`);
  }
  await pool.query(`
    INSERT INTO broker_accounts(id,user_id,provider,provider_account_id,access_token_encrypted,token_expires_at,status,metadata)
    VALUES(gen_random_uuid(),$1,'upstox',$2,$3,CASE WHEN $4::bigint IS NULL THEN NULL ELSE to_timestamp($4::double precision / 1000) END,'ACTIVE',$5::jsonb)
    ON CONFLICT(user_id,provider) DO UPDATE SET provider_account_id=EXCLUDED.provider_account_id,access_token_encrypted=EXCLUDED.access_token_encrypted,token_expires_at=EXCLUDED.token_expires_at,status='ACTIVE',metadata=EXCLUDED.metadata,updated_at=now()
  `, [userId, payload.user_id, encryptSecret(payload.access_token), typeof payload.expires_at === 'number' ? payload.expires_at : null, JSON.stringify({ tokenType: payload.token_type ?? 'Bearer' })]);
  return { userId, providerUserId: payload.user_id };
}
