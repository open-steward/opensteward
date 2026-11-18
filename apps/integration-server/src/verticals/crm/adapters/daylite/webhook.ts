import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify the Daylite webhook signature.
 *
 * Daylite webhook subscriptions deliver a signature in the
 * `X-Daylite-Signature` header — HMAC-SHA256 of the raw request body,
 * hex-encoded, using the subscription secret.
 *
 * If the signature header is absent this function returns false, so callers
 * should handle unsigned deliveries according to their security posture.
 *
 * Docs: https://developer.daylite.app/reference/webhook-subscriptions
 */
export function verifyDayliteWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['x-daylite-signature'] ?? headers['X-Daylite-Signature']
  if (!sig) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex')

  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))
  } catch {
    return false
  }
}

/**
 * Parse a Daylite webhook event.
 *
 * Daylite delivers a single JSON object per webhook call with an `event` field
 * (e.g. "contact.created", "opportunity.updated") and a `data` object
 * containing the affected resource.
 *
 * Example payload:
 * {
 *   "event": "contact.created",
 *   "data": { "self": "/v1/contacts/123", ... }
 * }
 */
export function parseDayliteWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const events = Array.isArray(payload) ? payload : [payload]

  return events.map((event) => {
    const ev = event as Record<string, unknown>
    const eventType = String(ev['event'] ?? 'unknown').toLowerCase()
    const parts = eventType.split('.')
    const actionPart = parts[1] ?? 'unknown'

    const data = (ev['data'] ?? {}) as Record<string, unknown>
    const selfUrl = String(data['self'] ?? '')
    const resourceIdMatch = selfUrl.match(/\/(\d+)$/)
    const resourceId = resourceIdMatch
      ? resourceIdMatch[1]
      : String(data['id'] ?? ev['id'] ?? 'unknown')

    return {
      platform: 'daylite',
      type: eventType,
      resourceType: 'unknown' as WebhookEvent['resourceType'],
      action: mapAction(actionPart),
      resourceId,
      payload: ev,
    }
  })

  function mapAction(raw: string): WebhookEvent['action'] {
    if (raw === 'created') return 'created'
    if (raw === 'updated') return 'updated'
    if (raw === 'deleted') return 'deleted'
    return 'unknown'
  }
}

export const dayliteWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyDayliteWebhook,
  parseWebhookEvents: parseDayliteWebhookEvents,
}
