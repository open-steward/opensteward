/**
 * GoCardless signs webhooks with HMAC-SHA-256 of the raw body, hex-encoded
 * in the `Webhook-Signature` header.
 *
 * Docs: https://developer.gocardless.com/api-reference/#webhooks-overview
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payments: 'charges',
  refunds: 'refunds',
  mandates: 'payment_methods',
  subscriptions: 'subscriptions',
  payouts: 'payouts',
  customers: 'customers',
  instalment_schedules: 'invoices',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  submitted: 'created',
  confirmed: 'succeeded',
  paid_out: 'paid',
  failed: 'failed',
  cancelled: 'cancelled',
  refunded: 'refunded',
  charged_back: 'disputed',
  customer_approval_granted: 'created',
  customer_approval_denied: 'cancelled',
  active: 'created',
}

function classify(event: { resource_type?: string; action?: string }): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  return {
    resourceType: RESOURCE_MAP[event.resource_type ?? ''] ?? 'unknown',
    action: ACTION_MAP[event.action ?? ''] ?? 'unknown',
  }
}

export function verifyGoCardlessWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['webhook-signature'] ?? headers['Webhook-Signature']
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

export function parseGoCardlessWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const events =
    (payload['events'] as Array<{
      id?: string
      resource_type?: string
      action?: string
      links?: Record<string, string>
    }>) ?? []
  return events.map((event) => {
    const { resourceType, action } = classify(event)
    const resourceId = event.links?.[event.resource_type ?? ''] ?? ''
    return {
      id: event.id,
      platform: 'gocardless',
      type: `${event.resource_type ?? 'unknown'}.${event.action ?? 'unknown'}`,
      resourceType,
      action,
      resourceId: String(resourceId),
      payload: event as Record<string, unknown>,
    }
  })
}

export const GoCardlessWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyGoCardlessWebhook,
  parseWebhookEvents: parseGoCardlessWebhookEvents,
}
