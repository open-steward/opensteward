/**
 * 2C2P signs every API request and backend notification with a compact JWS
 * (JWT) using HS256 keyed on the merchant's Secret Key. There is no OAuth and
 * no bearer token — the secret key is the sole shared secret.
 *
 * The webhook `verifyWebhook` contract is synchronous (returns `boolean`), so
 * we implement HS256 sign/verify directly on `node:crypto` rather than reach
 * for an async JOSE library. Verification is constant-time on the signature.
 *
 * Docs: https://developer.2c2p.com/docs/json-web-tokens-jwt
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
}

function base64urlToBuffer(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/')
  return Buffer.from(padded, 'base64')
}

/** Sign a claims object into a compact HS256 JWS using the merchant secret. */
export function signJwtHs256(claims: Record<string, unknown>, secret: string): string {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify(claims))
  const signingInput = `${header}.${body}`
  const signature = base64url(createHmac('sha256', secret).update(signingInput).digest())
  return `${signingInput}.${signature}`
}

/** Verify an HS256 JWS signature against the merchant secret (constant time). */
export function verifyJwtHs256(token: string, secret: string): boolean {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [header, body, signature] = parts
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest()
    const got = base64urlToBuffer(signature)
    if (got.length !== expected.length) return false
    return timingSafeEqual(got, expected)
  } catch {
    return false
  }
}

/**
 * Decode the claims of a compact JWS WITHOUT verifying. Callers that need
 * authenticity must `verifyJwtHs256` first. Returns `{}` on any parse error so
 * transforms never throw on a malformed token.
 */
export function decodeJwtClaims(token: string): Record<string, unknown> {
  try {
    const body = token.split('.')[1]
    if (!body) return {}
    const json = base64urlToBuffer(body).toString('utf8')
    const parsed = JSON.parse(json) as unknown
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}
