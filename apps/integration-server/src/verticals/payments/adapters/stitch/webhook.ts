/**
 * Stitch webhook signature verification.
 *
 * Stitch signs webhooks in one of two formats depending on whether the
 * subscription was created via the legacy API or the newer Svix-based system.
 *
 * ## Legacy format (Payment Webhook Subscriptions)
 * Header: `X-Stitch-Signature: t=<epoch_seconds>,hmac_sha256=<hex>`
 * Signed payload: `<timestamp>.<json_body>` where the body is the
 * JSON-serialised (no extra whitespace) request body.
 * Docs: https://docs.stitch.money/webhooks_legacy
 *
 * ## Svix format (Webhook Event Subscriptions)
 * Headers: `svix-id`, `svix-timestamp`, `svix-signature`
 * The `svix-signature` header is a space-delimited list of `v1,<base64>` values.
 * Signed payload: `<svix_id>.<svix_timestamp>.<raw_body>`
 * The signing secret has a `whsec_` prefix that must be stripped before
 * base64-decoding.
 * Docs: https://docs.stitch.money/webhooks/using_webhooks
 *
 * `verifyWebhook` tries the legacy path first (if `X-Stitch-Signature` is
 * present) then the Svix path (if `svix-signature` is present).  It returns
 * `false` — never throws — when neither signature can be validated, when the
 * secret is absent, or when the header is malformed.  Callers must treat a
 * `false` return as a hard rejection (fail-closed).
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Header lookup that is case-insensitive. */
function header(headers: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return v
  }
  return undefined
}

/**
 * Constant-time Buffer equality check.
 * Returns false (never throws) when lengths differ.
 */
function safeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

// ---------------------------------------------------------------------------
// Legacy verification  (X-Stitch-Signature)
// ---------------------------------------------------------------------------

/**
 * Parses `t=1670320325,hmac_sha256=abc123` → { timestamp: '1670320325', sig: 'abc123' }
 * Returns null when the header is absent or malformed.
 */
function parseLegacyHeader(value: string): { timestamp: string; sig: string } | null {
  // Expect exactly "t=<timestamp>,hmac_sha256=<hex>" with no spaces.
  const match = value.match(/^t=(\d+),hmac_sha256=([0-9a-fA-F]+)$/)
  if (!match) return null
  return { timestamp: match[1], sig: match[2] }
}

function verifyLegacy(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
  const raw = header(headers, 'x-stitch-signature')
  if (!raw || !secret) return false

  const parsed = parseLegacyHeader(raw)
  if (!parsed) return false

  // Re-serialize the body (strip whitespace) as documented.
  let jsonBody: string
  try {
    jsonBody = JSON.stringify(JSON.parse(payload.toString('utf8')))
  } catch {
    // Payload is not valid JSON — use raw bytes as-is.
    jsonBody = payload.toString('utf8')
  }

  const signed = `${parsed.timestamp}.${jsonBody}`
  const expected = createHmac('sha256', secret).update(signed, 'utf8').digest('hex')

  return safeEqual(Buffer.from(expected, 'hex'), Buffer.from(parsed.sig, 'hex'))
}

// ---------------------------------------------------------------------------
// Svix verification  (svix-id / svix-timestamp / svix-signature)
// ---------------------------------------------------------------------------

function verifySvix(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
  const svixId = header(headers, 'svix-id')
  const svixTimestamp = header(headers, 'svix-timestamp')
  const svixSignatures = header(headers, 'svix-signature')

  if (!svixId || !svixTimestamp || !svixSignatures || !secret) return false

  // Strip optional `whsec_` prefix and base64-decode the secret.
  const secretBase64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
  let keyBuf: Buffer
  try {
    keyBuf = Buffer.from(secretBase64, 'base64')
  } catch {
    return false
  }

  const signed = `${svixId}.${svixTimestamp}.${payload.toString('utf8')}`
  const expected = createHmac('sha256', keyBuf).update(signed, 'utf8').digest('base64')
  const expectedBuf = Buffer.from(expected)

  // The header may contain multiple space-delimited `v1,<base64>` signatures.
  for (const token of svixSignatures.split(' ')) {
    const commaIdx = token.indexOf(',')
    if (commaIdx === -1) continue
    const version = token.slice(0, commaIdx)
    const sigB64 = token.slice(commaIdx + 1)
    if (version !== 'v1') continue // unsupported version — skip
    try {
      const sigBuf = Buffer.from(sigB64)
      if (safeEqual(expectedBuf, sigBuf)) return true
    } catch {
      // malformed base64 — try next token
    }
  }

  return false
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false
  try {
    // Prefer the legacy header when present; fall through to Svix otherwise.
    if (header(headers, 'x-stitch-signature')) {
      return verifyLegacy(payload, headers, secret)
    }
    if (header(headers, 'svix-signature')) {
      return verifySvix(payload, headers, secret)
    }
    // No recognised signature header present — fail closed.
    return false
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
      platform: 'stitch',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const StitchWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
