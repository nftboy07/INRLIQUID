import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function key(): Buffer {
  const raw = process.env.APP_ENCRYPTION_KEY;
  if (!raw) throw new Error('APP_ENCRYPTION_KEY_NOT_CONFIGURED');
  const value = Buffer.from(raw, 'base64');
  if (value.length !== 32) throw new Error('APP_ENCRYPTION_KEY_MUST_BE_32_BYTES_BASE64');
  return value;
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ciphertext]).toString('base64');
}

export function decryptSecret(value: string): string {
  const packed = Buffer.from(value, 'base64');
  if (packed.length < 28) throw new Error('INVALID_ENCRYPTED_SECRET');
  const iv = packed.subarray(0, 12);
  const tag = packed.subarray(12, 28);
  const ciphertext = packed.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
