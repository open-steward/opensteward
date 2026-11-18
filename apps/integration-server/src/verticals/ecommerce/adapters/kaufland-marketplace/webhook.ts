/**
 * Kaufland Marketplace push notification (webhook) verification and event parsing.
 *
 * Verification: Kaufland signs incoming HTTP POST callbacks using the same
 * HMAC-SHA256 algorithm used for outgoing API requests. The incoming headers
 * carry `Shop-Timestamp` and `Shop-Signature`. To verify:
 *   1. Read Shop-Timestamp from the headers.
 *   2. Reconstruct the signed string: "POST\n<callback_url>\n<body>\n<timestamp>"
 *   3. Compute HMAC-SHA256 with the Secret Key and compare to Shop-Signature.
 *
 * The `secret` parameter may encode both the Secret Key and the registered
 * callback URL by joining them with a pipe character:
 *   "<secretKey>|<callbackUrl>"
 * If a pipe is present the string is split; otherwise the whole value is
 * treated as the Secret Key and an empty string is used for the URI segment
 * (which will fail verification but keeps the function from throwing).
 *
 * Event types from Kaufland push notifications:
 *   order_new, order_unit_new, order_unit_status_changed,
 *   item_changed, category_changed,
 *   item_unit_new, item_unit_changed, item_unit_deleted,
 *   item_unit_out_of_stock, item_unit_not_available, item_unit_available,
 *   return_new, return_status_changed, return_unit_status_changed,
 *   buy_box_changed
 *
 * Docs: https://sellerapi.kaufland.com/?page=push-notifications
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Verify a Kaufland push notification.
 *
 * Kaufland signs push-notification callbacks with the same HMAC-SHA256 scheme
 * used for outgoing API requests. The signed message is:
 *
 *   POST\n<callback_url>\n<body>\n<timestamp>
 *
 * The hex digest is placed in the `Shop-Signature` header and the Unix
 * timestamp in `Shop-Timestamp`.
 *
 * @param payload  Raw request body as a Buffer.
 * @param headers  Normalised (lower-case) request headers.
 * @param secret   Either the raw Secret Key, or "<secretKey>|<callbackUrl>"
 *                 to enable full four-part signature verification.
 */
export function verifyKauflandWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig = headers['shop-signature'] ?? headers['Shop-Signature']
    const headerTs = headers['shop-timestamp'] ?? headers['Shop-Timestamp']
    if (!headerSig || !headerTs) return false

    // Decode optional "<secretKey>|<callbackUrl>" encoding.
    const pipeIdx = secret.indexOf('|')
    const secretKey = pipeIdx >= 0 ? secret.slice(0, pipeIdx) : secret
    const callbackUrl = pipeIdx >= 0 ? secret.slice(pipeIdx + 1) : ''

    const bodyStr = payload.toString('utf8')
    // Kaufland signs: METHOD\nURI\nBODY\nTIMESTAMP  (same as outgoing requests)
    // Push notifications are always HTTP POST from Kaufland to the registered
    // callback URL.
    const message = ['POST', callbackUrl, bodyStr, headerTs].join('\n')
    const expected = createHmac('sha256', secretKey).update(message, 'utf8').digest('hex')

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
  order_new: 'orders',
  order_unit_new: 'orders',
  order_unit_status_changed: 'orders',
  item_changed: 'products',
  category_changed: 'collections',
  item_unit_new: 'inventory_levels',
  item_unit_changed: 'inventory_levels',
  item_unit_deleted: 'inventory_levels',
  item_unit_out_of_stock: 'inventory_levels',
  item_unit_not_available: 'inventory_levels',
  item_unit_available: 'inventory_levels',
  return_new: 'refunds',
  return_status_changed: 'refunds',
  return_unit_status_changed: 'refunds',
  buy_box_changed: 'products',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  order_new: 'created',
  order_unit_new: 'created',
  order_unit_status_changed: 'updated',
  item_changed: 'updated',
  category_changed: 'updated',
  item_unit_new: 'created',
  item_unit_changed: 'updated',
  item_unit_deleted: 'deleted',
  item_unit_out_of_stock: 'updated',
  item_unit_not_available: 'updated',
  item_unit_available: 'updated',
  return_new: 'created',
  return_status_changed: 'updated',
  return_unit_status_changed: 'updated',
  buy_box_changed: 'updated',
}

/**
 * Parse a Kaufland push notification body into a canonical WebhookEvent.
 * Kaufland delivers one event per HTTP POST; the event type is carried in
 * the body under `event_name`.
 */
export function parseKauflandWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventName = (payload['event_name'] as string | undefined) ?? ''
  const resourceType: WebhookResourceType = RESOURCE_MAP[eventName] ?? 'unknown'
  const action: WebhookAction = ACTION_MAP[eventName] ?? 'unknown'

  // Kaufland push notification bodies carry the resource id at various paths
  // depending on the event type. Try common locations.
  const rawId =
    payload['id_order_unit'] ??
    payload['id_order'] ??
    payload['id_unit'] ??
    payload['id'] ??
    ''
  const resourceId = String(rawId)

  return [
    {
      platform: 'kaufland-marketplace',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const kauflandWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyKauflandWebhook,
  parseWebhookEvents: parseKauflandWebhookEvents,
}
