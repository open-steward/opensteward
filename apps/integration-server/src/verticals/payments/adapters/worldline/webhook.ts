/**
 * Worldline Direct signs every webhook delivery with HMAC-SHA256 over the raw
 * request body, keyed by the webhooks secret configured in the Merchant
 * Portal. The base64-encoded signature ships in the `X-GCS-Signature` header;
 * `X-GCS-KeyId` identifies which webhooks key pair was used (so a merchant can
 * look up the matching secret).
 *
 * Event envelope:
 *   { apiVersion, id, created, merchantId, type, payment|refund }
 * `type` is dot-notation, e.g. `payment.captured`, `payment.refunded`,
 * `refund.refund_requested`.
 *
 * Docs: https://docs.direct.worldline-solutions.com/en/integration/api-developer-guide/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  refund: 'refunds',
  payout: 'payouts',
  dispute: 'disputes',
  chargeback: 'disputes',
  token: 'payment_methods',
  paymentlink: 'charges',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  authorization_requested: 'created',
  captured: 'paid',
  capture_requested: 'paid',
  paid: 'paid',
  completed: 'paid',
  refunded: 'refunded',
  refund_requested: 'refunded',
  cancelled: 'cancelled',
  reversed: 'cancelled',
  rejected: 'failed',
  rejected_capture: 'failed',
  chargebacked: 'disputed',
  chargeback_notification: 'disputed',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const lowered = eventType.toLowerCase()
  const dot = lowered.indexOf('.')
  if (dot === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = lowered.slice(0, dot).replace(/[._]/g, '')
  const verb = lowered.slice(dot + 1)
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyWorldlineWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-gcs-signature'] ?? headers['X-GCS-Signature']
    if (!sig) return false
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseWorldlineWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['type'] ?? '')
  const payment = payload['payment'] as Record<string, unknown> | undefined
  const refund = payload['refund'] as Record<string, unknown> | undefined
  const resource = payment ?? refund ?? {}
  const resourceId = String(resource['id'] ?? payload['id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: String(payload['id'] ?? ''),
      platform: 'worldline',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const WorldlineWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyWorldlineWebhook,
  parseWebhookEvents: parseWorldlineWebhookEvents,
}
