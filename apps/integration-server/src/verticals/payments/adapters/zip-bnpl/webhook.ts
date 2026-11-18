/**
 * ZipBnpl webhook event parsing and signature verification.
 *
 * Zip signs webhook deliveries using HMAC-SHA256 with a shared secret
 * provisioned during merchant onboarding.  The signature is Base64-encoded
 * and delivered in the `X-QP-Signature` request header.
 *
 * Reference: https://docs.us.zip.co/docs/api-implementation
 */

import { verifyHmacSha256 } from '@opensteward/shared'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/** Header name Zip uses for the HMAC-SHA256 webhook signature (Base64). */
const SIG_HEADER = 'x-qp-signature'

/**
 * Verify a Zip webhook delivery.
 *
 * Zip signs the raw request body with HMAC-SHA256 using the merchant's
 * shared secret and encodes the result as Base64 in the `X-QP-Signature`
 * header.
 *
 * Fail-closed: returns false when the header or secret is absent, or when
 * the signature does not match.  Never throws.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false
  // Headers may be lower-cased or original-case depending on the HTTP layer.
  const sig =
    headers[SIG_HEADER] ??
    headers['X-QP-Signature'] ??
    headers['X-Qp-Signature']
  if (!sig) return false
  // verifyHmacSha256 defaults to base64 encoding and uses timingSafeEqual.
  return verifyHmacSha256(payload, secret, sig, 'base64')
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
      platform: 'zip-bnpl',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const ZipBnplWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
