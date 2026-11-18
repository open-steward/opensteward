/**
 * Zalando Order Events API (OEA) webhook handling.
 *
 * Zalando's OEA sends order-event notifications via HTTPS POST to a
 * merchant-registered endpoint. The platform verifies the receiver by
 * comparing the `x-api-key` header against the shared secret the merchant
 * registered with Zalando.
 *
 * There is no HMAC signature on the payload body — verification is purely
 * API-key based (`timingSafeEqual` to prevent timing attacks).
 *
 * Event payloads include an `event_id`, `event_type`, `order_number`, and
 * an `order` object with the full order state.
 *
 * Docs: https://docs.partner-solutions.zalan.do/en/oea/getting-started.html
 */

import { timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Verify a Zalando OEA webhook delivery.
 *
 * Zalando passes the shared API key in the `x-api-key` header (or
 * `Authorization: Basic <key>` depending on the registration method).
 * Compare using `timingSafeEqual` to prevent timing attacks.
 */
export function verifyZalandoWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerKey =
      headers['x-api-key'] ??
      headers['X-Api-Key'] ??
      // Support "Authorization: Basic <key>" fallback
      headers['authorization']?.replace(/^Basic\s+/i, '') ??
      headers['Authorization']?.replace(/^Basic\s+/i, '')

    if (!headerKey) return false

    const a = Buffer.from(headerKey)
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event-type → canonical mapping ───────────────────────────────────────────

/**
 * Zalando OEA event types follow the pattern `<noun>.<verb>`, e.g.
 * `order.created`, `order.status_changed`, `order_unit.status_changed`.
 */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  order: 'orders',
  order_unit: 'orders',
  shipment: 'fulfillments',
  return: 'refunds',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  status_changed: 'updated',
  canceled: 'updated',
  shipped: 'updated',
  delivered: 'updated',
  returned: 'updated',
}

function mapEventType(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // Format: "<resource>.<action>" e.g. "order.created"
  const [resource = '', verb = ''] = eventType.toLowerCase().split('.')
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Zalando OEA webhook delivery into canonical WebhookEvents.
 *
 * Zalando delivers one event per HTTP request. The `event_type` field
 * classifies the notification; `order_number` is the primary resource id.
 */
export function parseZalandoWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventType =
    (payload['event_type'] as string | undefined) ??
    (payload['type'] as string | undefined) ??
    ''

  const { resourceType, action } = eventType
    ? mapEventType(eventType)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const resourceId =
    (payload['order_number'] as string | undefined) ??
    (payload['id'] as string | undefined) ??
    ''

  return [
    {
      platform: 'zalando',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const zalandoWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyZalandoWebhook,
  parseWebhookEvents: parseZalandoWebhookEvents,
}
