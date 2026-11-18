/**
 * Square webhook signatures — HMAC-SHA-256 of `notification_url + raw_body`
 * keyed with the subscription's signature key, returned base64 in
 * `x-square-hmacsha256-signature`.
 *
 * Docs: https://developer.squareup.com/docs/webhooks/step3validate
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const NOTIFICATION_URL_ENV = 'SQUARE_WEBHOOK_URL'

export function verifySquareWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sigHeader =
      headers['x-square-hmacsha256-signature'] ??
      headers['X-Square-Hmacsha256-Signature']
    if (!sigHeader) return false
    const notifUrl = process.env[NOTIFICATION_URL_ENV] ?? ''
    const expected = createHmac('sha256', secret)
      .update(notifUrl + payload.toString('utf8'))
      .digest('base64')
    const a = Buffer.from(sigHeader)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  refund: 'refunds',
  customer: 'customers',
  invoice: 'invoices',
  subscription: 'subscriptions',
  payout: 'payouts',
  dispute: 'disputes',
  card: 'payment_methods',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  refunded: 'refunded',
  paid: 'paid',
  voided: 'voided',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const [resource, ...rest] = eventType.split('.')
  const verb = rest.pop() ?? ''
  return {
    resourceType: RESOURCE_MAP[resource ?? ''] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function parseSquareWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['type'] ?? '')
  const eventId = String(payload['event_id'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const object = (data['object'] as Record<string, unknown> | undefined) ?? {}
  const inner = (Object.values(object)[0] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['id'] ?? inner['id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: eventId || undefined,
      platform: 'square',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const SquareWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySquareWebhook,
  parseWebhookEvents: parseSquareWebhookEvents,
}
