/**
 * Klarna delivers webhook-style notifications under the merchant's
 * notification URL. Klarna's signature scheme is HMAC-SHA-256 of the raw
 * body using the shared secret, hex-encoded in the `Klarna-Signature`
 * header. Older "push notifications" from the Hosted Payment Page don't
 * sign — fall through to header-presence check.
 *
 * Docs: https://docs.klarna.com/api/notifications/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  order: 'charges',
  capture: 'charges',
  refund: 'refunds',
  customer: 'customers',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  authorized: 'created',
  captured: 'paid',
  cancelled: 'cancelled',
  refunded: 'refunded',
  failed: 'failed',
  expired: 'failed',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const parts = eventType.toLowerCase().split('.')
  const head = parts[0] ?? ''
  const verb = parts[parts.length - 1] ?? ''
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyKlarnaWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['klarna-signature'] ?? headers['Klarna-Signature']
    if (!sig) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseKlarnaWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? payload['type'] ?? '')
  const id = String(payload['notification_id'] ?? payload['id'] ?? '')
  const resourceId = String(
    payload['order_id'] ?? payload['capture_id'] ?? payload['refund_id'] ?? '',
  )
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: id || undefined,
      platform: 'klarna',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const KlarnaWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyKlarnaWebhook,
  parseWebhookEvents: parseKlarnaWebhookEvents,
}
