/**
 * Dwolla webhook event parsing and signature verification.
 *
 * Dwolla signs every webhook with an HMAC-SHA256 digest of the raw request
 * body, keyed with the webhook-subscription secret.  The digest is delivered
 * in the `X-Request-Signature-SHA-256` header as a lowercase hex string.
 *
 * Reference: https://developers.dwolla.com/docs/working-with-webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

const SIGNATURE_HEADER = 'x-request-signature-sha-256'

/**
 * Verify the Dwolla webhook signature.
 *
 * Fails closed (returns false) when:
 *  - the secret is absent / empty
 *  - the signature header is absent / empty
 *  - the computed digest does not match the header value
 *
 * Never throws.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false

    // Headers may arrive in any case; normalise to lowercase.
    const sig = headers[SIGNATURE_HEADER] ?? headers[SIGNATURE_HEADER.toUpperCase()] ?? ''
    if (!sig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')

    // Constant-time comparison to prevent timing attacks.
    const expectedBuf = Buffer.from(expected, 'utf8')
    const actualBuf = Buffer.from(sig, 'utf8')

    if (expectedBuf.byteLength !== actualBuf.byteLength) return false
    return timingSafeEqual(expectedBuf, actualBuf)
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
      platform: 'dwolla',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const DwollaWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
