import { createHmac, timingSafeEqual } from 'crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Vizion webhook signature verification.
 *
 * Vizion signs each webhook delivery using an HMAC-Based HTTP Signature.
 * The `x-vizion-signature` header carries a structured signature string:
 *
 *   Signature keyId=hmac-key-1,signature=<hex>,algorithm=SHA-256,
 *             created=<unix-ts>,expires=<unix-ts>,headers=(request-target) ...
 *
 * We extract the `signature` value and compare it against an HMAC-SHA256
 * of the raw body keyed with the configured webhook secret. The `expires`
 * field is validated against the current time with a 5-minute tolerance to
 * mitigate replay attacks.
 *
 * Reference: https://docs.vizionapi.com/reference/authentication
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const rawHeader =
    headers['x-vizion-signature'] ??
    headers['X-Vizion-Signature'] ??
    ''
  if (!rawHeader || !secret) return false

  // Parse the structured Signature header
  const sigMatch = rawHeader.match(/signature=([0-9a-fA-F]+)/)
  const expiresMatch = rawHeader.match(/expires=(\d+)/)

  const signature = sigMatch?.[1]
  if (!signature) return false

  // Validate expiry with a 5-minute tolerance
  if (expiresMatch?.[1]) {
    const expiresAt = Number(expiresMatch[1]) * 1000
    const tolerance = 5 * 60 * 1000
    if (Date.now() > expiresAt + tolerance) return false
  }

  const expected = createHmac('sha256', secret).update(payload).digest('hex')

  try {
    return timingSafeEqual(
      Buffer.from(signature, 'utf8'),
      Buffer.from(expected, 'utf8'),
    )
  } catch {
    return false
  }
}

/**
 * Parse a Vizion webhook update payload into canonical WebhookEvents.
 *
 * Vizion delivers a single update object per webhook call:
 *   {
 *     "id": "...",
 *     "status": "data_received",
 *     "reference_id": "...",
 *     "payload": { "container_id": "...", "milestones": [...], ... }
 *   }
 */
export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const referenceId = payload['reference_id'] != null ? String(payload['reference_id']) : undefined
  const status = String(payload['status'] ?? '')

  let action: WebhookEvent['action'] = 'updated'
  if (status === 'data_received' || status === 'update_received') {
    action = 'updated'
  }

  return [
    {
      platform: 'vizion-api',
      type: status || 'data_received',
      resourceType: 'tracking_event',
      action,
      resourceId: referenceId,
      payload: payload,
    },
  ]
}

export const vizionApiWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
