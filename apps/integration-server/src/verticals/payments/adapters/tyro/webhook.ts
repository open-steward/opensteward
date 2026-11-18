/**
 * Tyro Connect webhook verification + event parsing.
 *
 * Tyro signs every webhook delivery with HMAC-SHA256. The signed payload is
 * the raw HTTP request body. The hex-encoded digest is sent in the
 * `Tyro-Connect-Signature` header.
 *
 * Reference: https://docs.connect.tyro.com/pos/notifications/webhooks/
 *
 *   calculatedSignature = hmacSha256(signingKey, request.body)
 *   expectedSignature   = request.headers["Tyro-Connect-Signature"]
 *
 * Signing keys are generated per webhook URL (optionally per event type)
 * during the Tyro Connect setup process.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify the `Tyro-Connect-Signature` header using HMAC-SHA256.
 *
 * Fails closed (returns false) when the secret, header, or payload is absent.
 * Never throws.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false

    const signature = headers['tyro-connect-signature'] ?? headers['Tyro-Connect-Signature']
    if (!signature) return false

    if (payload.length === 0) return false

    const computed = createHmac('sha256', secret).update(payload).digest('hex')

    const expectedBuf = Buffer.from(signature, 'hex')
    const computedBuf = Buffer.from(computed, 'hex')

    if (expectedBuf.length === 0 || expectedBuf.length !== computedBuf.length) return false

    return timingSafeEqual(computedBuf, expectedBuf)
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
      platform: 'tyro',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const TyroWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
