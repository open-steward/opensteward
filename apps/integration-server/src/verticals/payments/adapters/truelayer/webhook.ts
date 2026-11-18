/**
 * TrueLayer webhook signature verification.
 *
 * TrueLayer signs every webhook delivery with an ES512 (ECDSA P-521 / SHA-512)
 * private key.  The resulting signature travels in the `Tl-Signature` request
 * header as a JWS with **detached content**:
 *
 *   <base64url(JOSE-header)>..<base64url(ES512-signature)>
 *
 * The JOSE header carries:
 *   - alg        "ES512"
 *   - kid        key-id UUID
 *   - tl_version "2"
 *   - tl_headers comma-separated ordered list of headers that were signed
 *
 * The JWS signing payload is constructed (per TrueLayer signing v2 spec) as:
 *   POST <absolute-path>\n
 *   <header-name>: <header-value>\n  (one line per header in tl_headers order)
 *   <raw-body-bytes>                 (no trailing newline)
 *
 * Configuration — the `secret` adapter config field must contain two parts
 * separated by a single `\n` character:
 *
 *   Line 1: the absolute webhook endpoint path (e.g. /webhooks/payments/truelayer)
 *   Lines 2-N: the PEM-encoded EC public key, downloaded from TrueLayer's JWKS
 *              endpoint for your environment:
 *                live:    https://webhooks.truelayer.com/.well-known/jwks
 *                sandbox: https://webhooks.truelayer-sandbox.com/.well-known/jwks
 *
 * Example secret value:
 *   /webhooks/payments/truelayer\n-----BEGIN PUBLIC KEY-----\nMIGbMB...\n-----END PUBLIC KEY-----
 *
 * Returns false (fail-closed) on any missing input, parse error, or mismatch.
 *
 * Spec: https://docs.truelayer.com/docs/verify-webhook-signatures
 */

import { createPublicKey, verify as cryptoVerify } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TlJoseHeader {
  alg?: string
  kid?: string
  tl_version?: string
  tl_headers?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Base64url-decode a string to a Buffer (no padding required).
 */
function b64urlDecode(s: string): Buffer {
  const pad = (4 - (s.length % 4)) % 4
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat(pad)
  return Buffer.from(b64, 'base64')
}

/**
 * Parse the `Tl-Signature` detached-JWS header.
 *
 * Expected format: <base64url-JOSE-header>..<base64url-signature>
 * The double-dot `..` marks the absent (detached) payload section.
 * Returns null if the header is absent, malformed, or uses an unexpected algorithm.
 */
function parseTlSignature(
  header: string,
): { joseHeader: TlJoseHeader; sigBytes: Buffer } | null {
  // Locate the ".." separator — base64url characters cannot contain "." so
  // the first occurrence is always the detached-payload separator.
  const sepIdx = header.indexOf('..')
  if (sepIdx < 1) return null
  const encodedHeader = header.slice(0, sepIdx)
  const encodedSig = header.slice(sepIdx + 2)
  if (!encodedSig) return null

  let joseHeader: TlJoseHeader
  try {
    joseHeader = JSON.parse(b64urlDecode(encodedHeader).toString('utf8')) as TlJoseHeader
  } catch {
    return null
  }

  if (joseHeader.alg !== 'ES512') return null
  if (joseHeader.tl_version !== '2') return null

  // The signature travels as IEEE P1363 format (r‖s, 132 bytes for P-521).
  // Node's crypto.verify for EC keys expects DER — convert here.
  const rawSig = b64urlDecode(encodedSig)
  const sigBytes = p1363ToDer(rawSig)
  if (!sigBytes) return null

  return { joseHeader, sigBytes }
}

/**
 * Convert an IEEE P1363 raw ECDSA signature (r‖s, big-endian fixed-width)
 * to DER SEQUENCE { INTEGER r, INTEGER s } as required by Node's crypto.verify.
 *
 * For ES512 (P-521) the raw signature is 132 bytes (2 × 66 bytes).
 */
function p1363ToDer(raw: Buffer): Buffer | null {
  const half = raw.length / 2
  if (!Number.isInteger(half) || half < 16) return null

  const r = raw.subarray(0, half)
  const s = raw.subarray(half)

  function encodeInt(n: Buffer): Buffer {
    // Strip leading zero bytes (keep at least one).
    let i = 0
    while (i < n.length - 1 && n[i] === 0) i++
    n = n.subarray(i)
    // A leading 0x00 is required when the high bit is set (positive integer).
    if ((n[0]! & 0x80) !== 0) n = Buffer.concat([Buffer.from([0x00]), n])
    return Buffer.concat([Buffer.from([0x02]), encodeLength(n.length), n])
  }

  function encodeLength(len: number): Buffer {
    if (len < 0x80) return Buffer.from([len])
    if (len < 0x100) return Buffer.from([0x81, len])
    return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff])
  }

  const rDer = encodeInt(r)
  const sDer = encodeInt(s)
  const seqBody = Buffer.concat([rDer, sDer])
  return Buffer.concat([Buffer.from([0x30]), encodeLength(seqBody.length), seqBody])
}

/**
 * Reconstruct the JWS signing payload that TrueLayer created.
 *
 * Format (TrueLayer signing v2):
 *   METHOD PATH\n
 *   Header-Name: header-value\n   (one per entry in tl_headers, in order)
 *   <raw-body-bytes>              (no trailing newline)
 */
function buildSigningPayload(
  method: string,
  path: string,
  signedHeaders: string[],
  headers: Record<string, string>,
  body: Buffer,
): Buffer {
  const lines: string[] = [`${method.toUpperCase()} ${path}`]
  for (const name of signedHeaders) {
    const value = headers[name.toLowerCase()] ?? headers[name] ?? ''
    lines.push(`${name}: ${value}`)
  }
  const prefix = Buffer.from(lines.join('\n') + '\n', 'utf8')
  return Buffer.concat([prefix, body])
}

/**
 * Parse the `secret` config field into the webhook path and PEM public key.
 *
 * Expected format:  <path>\n<PEM>
 * e.g.: /webhooks/payments/truelayer\n-----BEGIN PUBLIC KEY-----\n...
 */
function parseSecret(secret: string): { path: string; pem: string } | null {
  const nlIdx = secret.indexOf('\n')
  if (nlIdx < 1) return null
  const path = secret.slice(0, nlIdx).trim()
  const pem = secret.slice(nlIdx + 1).trim()
  if (!path.startsWith('/') || !pem.includes('BEGIN')) return null
  return { path, pem }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify a TrueLayer webhook request.
 *
 * @param payload  Raw request body (Buffer).
 * @param headers  Lower-cased request headers (must include `tl-signature`
 *                 and any headers listed in `tl_headers`).
 * @param secret   Multiline string: first line is the absolute webhook path,
 *                 remaining lines are the PEM-encoded EC public key obtained
 *                 from TrueLayer's JWKS endpoint.
 *
 * Returns `true` only when the ES512 signature is cryptographically valid.
 * Returns `false` on ANY missing input, parse error, or signature mismatch
 * (fail-closed).
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false

    const config = parseSecret(secret)
    if (!config) return false

    const rawSigHeader = headers['tl-signature'] ?? headers['Tl-Signature']
    if (!rawSigHeader) return false

    const parsed = parseTlSignature(rawSigHeader)
    if (!parsed) return false

    const { joseHeader, sigBytes } = parsed

    // tl_headers: comma-separated header names that were included in the
    // signature payload.  May be an empty string if no headers were signed.
    const signedHeaders =
      joseHeader.tl_headers
        ?.split(',')
        .map((h) => h.trim())
        .filter(Boolean) ?? []

    const signingPayload = buildSigningPayload(
      'POST',
      config.path,
      signedHeaders,
      headers,
      payload,
    )

    const publicKey = createPublicKey({ key: config.pem, format: 'pem' })

    // crypto.verify is synchronous when called without a callback.
    return cryptoVerify('sha512', signingPayload, publicKey, sigBytes)
  } catch {
    return false
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type =
    typeof payload['type'] === 'string'
      ? payload['type']
      : typeof payload['event'] === 'string'
        ? payload['event']
        : String(payload['type'] ?? '')
  const id = typeof payload['id'] === 'string' ? payload['id'] : undefined
  const dataObj =
    typeof payload['data'] === 'object' && payload['data'] !== null
      ? (payload['data'] as Record<string, unknown>)
      : {}
  const resourceId =
    typeof payload['resource_id'] === 'string'
      ? payload['resource_id']
      : typeof dataObj['id'] === 'string'
        ? dataObj['id']
        : ''
  return [
    {
      id,
      platform: 'truelayer',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const TruelayerWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
