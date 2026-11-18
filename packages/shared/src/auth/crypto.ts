/**
 * Shared AES-256-GCM helpers used by every encrypted-at-rest store
 * (`CredentialStore`, `EndUserStore`, …).
 *
 * Key derivation uses `scryptSync` with the deployment's `STORE_SECRET`
 * plus a per-store salt so two stores can share the same secret without
 * sharing key material. Each ciphertext carries its own random IV +
 * GCM auth tag.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY_LEN = 32
const IV_LEN = 12
const TAG_LEN = 16

export const DEFAULT_SALT = 'opensteward-v1'

export function deriveKey(secret: string, salt: string): Buffer {
  return scryptSync(secret, salt, KEY_LEN, { N: 16384, r: 8, p: 1 })
}

export function encrypt(plaintext: string, secret: string, salt: string): string {
  const key = deriveKey(secret, salt)
  const iv = randomBytes(IV_LEN)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return Buffer.concat([iv, tag, enc]).toString('base64')
}

export function decrypt(ciphertext: string, secret: string, salt: string): string {
  const key = deriveKey(secret, salt)
  const buf = Buffer.from(ciphertext, 'base64')
  const iv = buf.subarray(0, IV_LEN)
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN)
  const enc = buf.subarray(IV_LEN + TAG_LEN)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc).toString('utf8') + decipher.final('utf8')
}
