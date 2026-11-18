/**
 * Toast webhook verification and event parsing.
 *
 * Toast signs webhooks with HMAC-SHA256 using the webhook secret.
 * The signature is sent in the `X-Toast-Signature` header as a
 * hex-encoded string.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyToastWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-toast-signature'] ??
      headers['X-Toast-Signature']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
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
  menu: 'products',
  order: 'orders',
  payment: 'transactions',
  customer: 'customers',
  restaurant: 'locations',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  completed: 'updated',
  voided: 'deleted',
}

function mapEventType(type: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  // Toast event types: "menu.updated", "order.created", "payment.completed", etc.
  const parts = type.toLowerCase().split('.')
  const resource = parts[0] ?? 'unknown'
  const action = parts[parts.length - 1] ?? 'unknown'
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[action] ?? 'unknown',
  }
}

/**
 * Parse a Toast webhook delivery into canonical events.
 * Toast sends one event per delivery.
 */
export function parseToastWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const type = (payload['eventType'] as string) ?? ''
  const { resourceType, action } = mapEventType(type)

  const resourceId = (payload['resourceId'] as string) ??
    (payload['entityId'] as string) ?? ''
  const restaurantId = payload['restaurantGuid'] as string | undefined
  const eventId = payload['webhookId'] as string | undefined

  return [
    {
      id: eventId,
      platform: 'toast',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      tenantId: restaurantId,
      payload,
    },
  ]
}

export const toastWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyToastWebhook,
  parseWebhookEvents: parseToastWebhookEvents,
}
