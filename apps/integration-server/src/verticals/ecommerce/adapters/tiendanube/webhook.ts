/**
 * Tiendanube / Nuvemshop webhook verification and event parsing.
 *
 * Verification: Tiendanube signs the raw request body with HMAC-SHA256
 * using the app's client secret. The resulting hash (hex or base64 — the
 * platform documentation indicates hex) is placed in the
 * `x-linkedstore-hmac-sha256` header. We compare using `timingSafeEqual`
 * to avoid timing attacks.
 *
 * Event parsing: Tiendanube sends the event name (e.g. `product/created`)
 * in the `event` field of the JSON payload itself, alongside the `store_id`
 * and a resource `id`.
 *
 * Docs: https://tiendanube.github.io/api-documentation/resources/webhook
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyTiendanubeWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-linkedstore-hmac-sha256'] ??
      headers['X-Linkedstore-Hmac-Sha256'] ??
      headers['HTTP_X_LINKEDSTORE_HMAC_SHA256']
    if (!headerSig) return false

    // Tiendanube documents hex digest output for webhook signatures
    const expectedHex = createHmac('sha256', secret).update(payload).digest('hex')
    const aHex = Buffer.from(headerSig.toLowerCase())
    const bHex = Buffer.from(expectedHex)
    if (aHex.length === bHex.length && timingSafeEqual(aHex, bHex)) return true

    // Also try base64 in case the platform switches encoding
    const expectedB64 = createHmac('sha256', secret).update(payload).digest('base64')
    const aB64 = Buffer.from(headerSig)
    const bB64 = Buffer.from(expectedB64)
    if (aB64.length === bB64.length && timingSafeEqual(aB64, bB64)) return true

    return false
  } catch {
    return false
  }
}

// ── Event topic → canonical mapping ─────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  'product_variant': 'products',
  order: 'orders',
  customer: 'customers',
  fulfillment: 'fulfillments',
  category: 'collections',
  location: 'locations',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  // Order-specific actions mapped to closest canonical equivalents
  paid: 'updated',
  packed: 'updated',
  fulfilled: 'updated',
  cancelled: 'deleted',
  edited: 'updated',
  pending: 'updated',
  voided: 'updated',
  unpacked: 'updated',
  // App events
  uninstalled: 'deleted',
  suspended: 'updated',
  resumed: 'updated',
}

function mapEvent(event: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // Tiendanube event format: "<resource>/<action>", e.g. "product/created"
  const [resource = 'unknown', action = 'unknown'] = event.toLowerCase().split('/')
  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[action] ?? 'unknown',
  }
}

/**
 * Parse a Tiendanube webhook delivery into a single canonical event.
 * Tiendanube always delivers one event per HTTP request.
 */
export function parseTiendanubeWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = (payload['event'] as string | undefined) ?? ''
  const { resourceType, action } = event
    ? mapEvent(event)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'tiendanube',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const tiendanubeWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyTiendanubeWebhook,
  parseWebhookEvents: parseTiendanubeWebhookEvents,
}
