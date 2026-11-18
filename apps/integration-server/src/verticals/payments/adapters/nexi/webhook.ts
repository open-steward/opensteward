/**
 * Nexi Checkout (Nets Easy) webhooks.
 *
 * Nexi does NOT HMAC-sign webhook deliveries. Instead, when a webhook is
 * registered the merchant supplies an `authorization` value (8–32 alphanumeric
 * characters); Nexi echoes that exact value back in the `Authorization` header
 * of every callback POST. Verification is therefore a constant-time comparison
 * of the inbound `Authorization` header against the stored shared secret.
 *
 * Envelope (all events):
 *   { id, merchantNumber|merchantId, timestamp, event, data: { … } }
 * where `data` carries `paymentId` plus a resource id (`chargeId` / `refundId`)
 * and an `{ amount, currency }` envelope depending on the event.
 *
 * Docs: https://developer.nexigroup.com/nexi-checkout/en-EU/docs/track-events-using-webhooks/
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Map a Nexi event name (`payment.charge.created.v2`, `payment.refund.completed`,
 * …) onto the canonical `{ resourceType, action }`. The "v2" suffix and the
 * sub-resource segment (`charge`/`refund`/`cancel`/`reservation`/`checkout`) are
 * what determine the canonical mapping; the leading `payment` is constant.
 */
const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'payment.created': { resourceType: 'charges', action: 'created' },
  'payment.reservation.created': { resourceType: 'charges', action: 'created' },
  'payment.reservation.created.v2': { resourceType: 'charges', action: 'created' },
  'payment.reservation.failed': { resourceType: 'charges', action: 'failed' },
  'payment.checkout.completed': { resourceType: 'charges', action: 'succeeded' },
  'payment.charge.created': { resourceType: 'charges', action: 'succeeded' },
  'payment.charge.created.v2': { resourceType: 'charges', action: 'succeeded' },
  'payment.charge.failed': { resourceType: 'charges', action: 'failed' },
  'payment.refund.initiated': { resourceType: 'refunds', action: 'created' },
  'payment.refund.initiated.v2': { resourceType: 'refunds', action: 'created' },
  'payment.refund.completed': { resourceType: 'refunds', action: 'succeeded' },
  'payment.refund.failed': { resourceType: 'refunds', action: 'failed' },
  'payment.cancel.created': { resourceType: 'charges', action: 'cancelled' },
  'payment.cancel.failed': { resourceType: 'charges', action: 'failed' },
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  return EVENT_MAP[eventType.toLowerCase()] ?? { resourceType: 'unknown', action: 'unknown' }
}

export function verifyNexiWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers['authorization'] ?? headers['Authorization']
    if (!provided || !secret) return false
    const a = Buffer.from(provided)
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseNexiWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(
    data['chargeId'] ?? data['refundId'] ?? data['paymentId'] ?? payload['id'] ?? '',
  )
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: payload['id'] != null ? String(payload['id']) : undefined,
      platform: 'nexi',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const NexiWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyNexiWebhook,
  parseWebhookEvents: parseNexiWebhookEvents,
}
