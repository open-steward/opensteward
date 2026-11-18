/**
 * Jumpseller webhook verification and event parsing.
 *
 * Verification:
 *   Jumpseller signs the raw request body with HMAC-SHA256 (base64) using the
 *   store's hooks token and places the result in the `Jumpseller-Hmac-Sha256`
 *   header. Compare using `timingSafeEqual`.
 *
 * Event identification:
 *   The `Jumpseller-Event` header carries the event name, e.g.
 *   `order_paid`, `product_updated`, `customer_deleted`.
 *   The `Jumpseller-Store-Code` and `Jumpseller-Triggered-At` headers are
 *   also present but not required for canonical parsing.
 *
 * Docs: https://jumpseller.com/support/webhooks/
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyJumpsellerWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['jumpseller-hmac-sha256'] ?? headers['Jumpseller-Hmac-Sha256']
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

// ── Event → canonical mapping ─────────────────────────────────────────────────

/**
 * Jumpseller event names follow the pattern `<resource>_<action>`.
 * Map the resource portion to a canonical WebhookResourceType.
 */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  order: 'orders',
  product: 'products',
  customer: 'customers',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  create: 'created',
  updated: 'updated',
  update: 'updated',
  paid: 'updated',
  shipped: 'updated',
  canceled: 'updated',
  cancelled: 'updated',
  deleted: 'deleted',
  delete: 'deleted',
  // product stock update
  stock_updated: 'updated',
  stock_update: 'updated',
}

function mapEvent(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // Jumpseller event format: "<resource>_<action>" e.g. "order_paid",
  // "product_updated", "customer_deleted".
  const lower = event.toLowerCase()
  // Try the longest matching resource prefix first.
  for (const [resource, resourceType] of Object.entries(RESOURCE_MAP)) {
    if (lower.startsWith(`${resource}_`)) {
      const actionPart = lower.slice(resource.length + 1)
      const action: WebhookAction = ACTION_MAP[actionPart] ?? 'unknown'
      return { resourceType, action }
    }
  }
  return { resourceType: 'unknown', action: 'unknown' }
}

/**
 * Parse a Jumpseller webhook delivery into zero-or-one canonical events.
 * The `Jumpseller-Event` header value is passed as `eventHeader`.
 */
export function parseJumpsellerWebhookEvents(
  payload: Record<string, unknown>,
  eventHeader?: string,
): WebhookEvent[] {
  const event =
    eventHeader ??
    (payload['event'] as string | undefined) ??
    ''

  const { resourceType, action } = event
    ? mapEvent(event)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'jumpseller',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const jumpsellerWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyJumpsellerWebhook,
  parseWebhookEvents: parseJumpsellerWebhookEvents,
}
