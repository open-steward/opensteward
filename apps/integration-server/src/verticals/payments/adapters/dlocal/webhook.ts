/**
 * dLocal signs webhook deliveries with HMAC-SHA-256 of the raw body keyed
 * with the merchant secret. The signature ships in
 * `Authorization: V2-HMAC-SHA256, Signature: …`. Same scheme as outbound
 * API requests, with `body` substituted for the request payload.
 *
 * Docs: https://docs.dlocal.com/reference/payment-notifications
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
}

const ACTION_MAP: Record<string, WebhookAction> = {
  paid: 'paid',
  authorized: 'created',
  rejected: 'failed',
  cancelled: 'cancelled',
  refunded: 'refunded',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // dLocal notification format: `payment.paid`, `refund.rejected`.
  const [head, verb] = eventType.toLowerCase().split('.')
  return {
    resourceType: RESOURCE_MAP[head ?? ''] ?? 'unknown',
    action: ACTION_MAP[verb ?? ''] ?? 'unknown',
  }
}

export function verifyDLocalWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const header = headers['authorization'] ?? headers['Authorization']
    if (!header) return false
    const m = header.match(/Signature:\s*([0-9a-f]+)/i)
    if (!m) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(m[1] ?? '', 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseDLocalWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['notification_type'] ?? payload['event'] ?? '')
  const id = String(payload['notification_id'] ?? '')
  const resourceId = String(payload['id'] ?? payload['payment_id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: id || undefined,
      platform: 'dlocal',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const DLocalWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyDLocalWebhook,
  parseWebhookEvents: parseDLocalWebhookEvents,
}
