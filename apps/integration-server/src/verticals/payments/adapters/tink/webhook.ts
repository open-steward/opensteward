/**
 * Tink webhook signature verification.
 *
 * Tink signs every webhook delivered via the Events V2 API with an
 * `X-Tink-Signature` header. The header has the form:
 *
 *   X-Tink-Signature: t=<unix_timestamp>,v1=<hex_hmac_sha256>
 *
 * The signed payload is: `<timestamp>.<raw_body>`
 *
 * The `secret` is the one-time value returned in the `secret` field of the
 * Create Webhook Endpoint response (POST /events/v2/webhook-endpoints).
 * Tink only exposes it once — store it securely at registration time.
 *
 * Docs: https://docs.tink.com/resources/api-setup/webhook-signature-validation
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse the `X-Tink-Signature` header value.
 *
 * Expected format: `t=<timestamp>,v1=<hex_sig>[,<ignored>]`
 *
 * Returns null if the header is absent, malformed, or missing required keys.
 */
function parseTinkSignatureHeader(header: string): { timestamp: string; sig: string } | null {
  const map: Record<string, string> = {}
  for (const part of header.split(',')) {
    const eqIdx = part.indexOf('=')
    if (eqIdx < 1) continue
    const key = part.slice(0, eqIdx).trim()
    const val = part.slice(eqIdx + 1).trim()
    if (key) map[key] = val
  }
  const timestamp = map['t']
  const sig = map['v1']
  if (!timestamp || !sig) return null
  return { timestamp, sig }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Verify a Tink webhook request.
 *
 * @param payload  Raw request body (Buffer).
 * @param headers  Request headers (case-insensitive lookup tried for both
 *                 lower-case and original-case variants).
 * @param secret   The signing secret stored when the webhook endpoint was
 *                 registered via POST /events/v2/webhook-endpoints.
 *
 * Returns `true` only when HMAC-SHA256 of `<timestamp>.<body>` matches the
 * signature in the `X-Tink-Signature` header.
 * Returns `false` on ANY missing input, parse error, or mismatch (fail-closed).
 * Never throws.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false

    const rawHeader =
      headers['x-tink-signature'] ?? headers['X-Tink-Signature']
    if (!rawHeader) return false

    const parsed = parseTinkSignatureHeader(rawHeader)
    if (!parsed) return false

    const { timestamp, sig } = parsed

    // Reconstruct the signed payload: "<timestamp>.<raw_body>"
    const messageToSign = `${timestamp}.${payload.toString('utf8')}`

    // Compute expected signature
    const expected = createHmac('sha256', secret)
      .update(messageToSign, 'utf8')
      .digest('hex')

    // Constant-time compare to prevent timing attacks
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length === 0 || a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type =
    typeof payload['event'] === 'string'
      ? payload['event']
      : typeof payload['type'] === 'string'
        ? payload['type']
        : String(payload['event'] ?? payload['type'] ?? '')
  const context =
    typeof payload['context'] === 'object' && payload['context'] !== null
      ? (payload['context'] as Record<string, unknown>)
      : {}
  const resourceId =
    typeof context['userId'] === 'string'
      ? context['userId']
      : typeof payload['id'] === 'string'
        ? payload['id']
        : ''
  return [
    {
      platform: 'tink',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const TinkWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
