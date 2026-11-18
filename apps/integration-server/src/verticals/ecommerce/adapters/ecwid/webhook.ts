/**
 * Ecwid webhook verification and event parsing.
 *
 * Ecwid webhooks deliver event notifications as JSON payloads. The
 * webhook payload includes `eventType` (e.g. `order.updated`,
 * `product.created`) and `entityId`. Ecwid does not sign webhook
 * payloads with HMAC by default — verification relies on a shared
 * webhook secret passed as a query parameter or in the payload.
 *
 * Docs: https://developer.ecwid.com/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyEcwidWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-ecwid-webhook-signature'] ?? headers['X-Ecwid-Webhook-Signature']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── EventType → canonical mapping ───────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  order: 'orders',
  customer: 'customers',
  discount_coupon: 'discounts',
  category: 'collections',
  inventory: 'inventory_levels',
}

function resolveResource(group: string): WebhookResourceType {
  return RESOURCE_MAP[group] ?? 'unknown'
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
}

function mapEventType(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // Ecwid event type format: `<resource>.<action>`, e.g. `order.updated`.
  const [group = 'unknown', verb = 'unknown'] = eventType.toLowerCase().split('.')
  return {
    resourceType: resolveResource(group),
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse an Ecwid webhook delivery into zero-or-one canonical events.
 *
 * Ecwid delivers a single event per HTTP request.
 */
export function parseEcwidWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType =
    (payload['eventType'] as string | undefined) ?? ''
  const { resourceType, action } = eventType
    ? mapEventType(eventType)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['entityId'] ?? payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'ecwid',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}


export const ecwidWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyEcwidWebhook,
  parseWebhookEvents: parseEcwidWebhookEvents,
}
