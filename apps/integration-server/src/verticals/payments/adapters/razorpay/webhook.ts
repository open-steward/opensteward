/**
 * Razorpay signs webhooks with HMAC-SHA-256 of the raw body, hex-encoded
 * in `X-Razorpay-Signature`.
 *
 * Docs: https://razorpay.com/docs/webhooks/validate-test/
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
  order: 'charges',
  refund: 'refunds',
  subscription: 'subscriptions',
  invoice: 'invoices',
  payout: 'payouts',
  dispute: 'disputes',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  authorized: 'created',
  captured: 'paid',
  failed: 'failed',
  refunded: 'refunded',
  paid: 'paid',
  created: 'created',
  expired: 'failed',
  cancelled: 'cancelled',
  completed: 'succeeded',
  activated: 'created',
  charged: 'paid',
  halted: 'failed',
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const parts = eventType.split('.')
  const head = parts[0] ?? ''
  const verb = parts.slice(1).join('.') || parts[0] || ''
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyRazorpayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-razorpay-signature'] ?? headers['X-Razorpay-Signature']
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

export function parseRazorpayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const eventId = String(payload['id'] ?? '')
  const entityPayload = (payload['payload'] as Record<string, unknown> | undefined) ?? {}
  const entity = Object.values(entityPayload)[0] as Record<string, unknown> | undefined
  const entityObject = (entity?.entity as Record<string, unknown> | undefined) ?? entity
  const resourceId = String(entityObject?.['id'] ?? '')
  const { resourceType, action } = classify(event)
  return [
    {
      id: eventId || undefined,
      platform: 'razorpay',
      type: event,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const RazorpayWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyRazorpayWebhook,
  parseWebhookEvents: parseRazorpayWebhookEvents,
}
