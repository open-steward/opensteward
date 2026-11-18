import { createPublicKey, type KeyObject } from 'node:crypto'
import { decodeBase64UrlStrict } from './base64url'
import { ED25519_PUBLIC_KEY_BYTES } from './constants'

/** kid to base64url (no padding) raw 32-byte Ed25519 public key. */
export type KeyMap = Readonly<Record<string, string>>

/** All-zero bytes, and the identity point (y = 1). Neither is a real key; both are refused. */
function isDegenerate(raw: Uint8Array): boolean {
  const tailZero = raw.subarray(1).every((b) => b === 0)
  return tailZero && (raw[0] === 0 || raw[0] === 1)
}

/** A key map entry to a KeyObject. Throws TypeError for anything but 32 real key bytes. */
export function importPublicKey(rawBase64Url: string): KeyObject {
  const raw = decodeBase64UrlStrict(rawBase64Url)
  if (raw === null || raw.byteLength !== ED25519_PUBLIC_KEY_BYTES || isDegenerate(raw)) {
    throw new TypeError('Ed25519 public key must be 32 bytes of base64url without padding')
  }
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x: rawBase64Url }, format: 'jwk' })
}

/** SPKI DER (what AWS KMS GetPublicKey returns) to a key map entry. */
export function publicKeyFromSpkiDer(der: Uint8Array): string {
  const key = createPublicKey({ key: Buffer.from(der), format: 'der', type: 'spki' })
  if (key.asymmetricKeyType !== 'ed25519') {
    throw new TypeError(`expected an Ed25519 key, got ${key.asymmetricKeyType ?? 'unknown'}`)
  }
  const { x } = key.export({ format: 'jwk' })
  if (typeof x !== 'string' || decodeBase64UrlStrict(x)?.byteLength !== ED25519_PUBLIC_KEY_BYTES) {
    throw new TypeError('unexpected Ed25519 JWK export')
  }
  return x
}
