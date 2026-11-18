/**
 * Square webhook verification and event parsing.
 *
 * Square signs webhooks with HMAC-SHA256 of `notificationUrl + rawBody`.
 * The signature is base64-encoded in the `x-square-hmacsha256-signature`
 * header.
 *
 * Docs: https://developer.squareup.com/docs/webhooks/step3validate
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifySquareWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
  notificationUrl?: string,
): boolean {
  try {
    const headerSig =
      headers['x-square-hmacsha256-signature'] ??
      headers['X-Square-Hmacsha256-Signature']
    if (!headerSig) return false

    // Square signs concatenation of notificationUrl + raw body. The unified
    // webhook router doesn't forward the request URL today; verification
    // will fail unless callers extract URL from `x-forwarded-url` and pass
    // through. TODO: wire vertical-level URL propagation.
    const combined = (notificationUrl ?? '') + payload.toString('utf8')
    const expected = createHmac('sha256', secret).update(combined).digest('base64')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event type → canonical mapping ──────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'transactions',
  order: 'orders',
  inventory: 'inventory_levels',
  catalog: 'products',
  customer: 'customers',
  refund: 'refunds',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
}

function mapEventType(type: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Square event types: "payment.created", "order.updated", "inventory.count.updated", etc.
  const parts = type.toLowerCase().split('.')
  const resource = parts[0] ?? 'unknown'
  const action = parts[parts.length - 1] ?? 'unknown'
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[action] ?? 'unknown',
  }
}

/**
 * Parse a Square webhook delivery into canonical events.
 * Square sends one event per delivery.
 */
export function parseSquareWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const type = (payload['type'] as string) ?? ''
  const { resourceType, action } = mapEventType(type)

  const data = payload['data'] as Record<string, unknown> | undefined
  const resourceId = (data?.['id'] as string) ?? ''
  const merchantId = payload['merchant_id'] as string | undefined
  const eventId = payload['event_id'] as string | undefined

  return [
    {
      id: eventId,
      platform: 'square',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      tenantId: merchantId,
      payload,
    },
  ]
}

export const squareWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifySquareWebhook,
  parseWebhookEvents: parseSquareWebhookEvents,
}
