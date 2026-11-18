/**
 * WooCommerce webhook verification and event parsing.
 *
 * Verification: WooCommerce signs the raw request body with HMAC-SHA256
 * and base64-encodes the digest, placing it in the
 * `X-WC-Webhook-Signature` header. NOTE: this base64-over-raw-body scheme
 * is documented in the WooCommerce PHP source
 * (`class-wc-webhook.php#generate_signature`) but is not spelled out in
 * the public REST-API docs — the manual smoke test validates this default.
 *
 * Event parsing: WooCommerce sends the topic (e.g. `product.created`) in
 * `X-WC-Webhook-Topic`, and it's also mirrored into the JSON body under a
 * top-level `topic` field on some payload shapes. Map these to the
 * canonical `{ resourceType, action }` pair.
 *
 * Docs: https://woocommerce.github.io/woocommerce-rest-api-docs/#webhooks
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyWooCommerceWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig =
      headers['x-wc-webhook-signature'] ?? headers['X-WC-Webhook-Signature']
    if (!headerSig) return false

    // base64 HMAC-SHA256 over the raw body — see header comment.
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Topic → canonical mapping ────────────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  product: 'products',
  order: 'orders',
  customer: 'customers',
  coupon: 'discounts',
  refund: 'refunds',
}

function resolveResource(group: string): WebhookResourceType {
  return RESOURCE_MAP[group] ?? 'unknown'
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  create: 'created',
  updated: 'updated',
  update: 'updated',
  deleted: 'deleted',
  delete: 'deleted',
  restored: 'updated',
  restore: 'updated',
}

function mapTopic(topic: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // WooCommerce topic format: `<resource>.<action>`, e.g. `order.updated`.
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('.')
  return {
    resourceType: resolveResource(group),
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a WooCommerce webhook delivery into zero-or-one canonical events.
 *
 * WooCommerce delivers a single event per HTTP request, so this always
 * returns an array of length 0 or 1.
 */
export function parseWooCommerceWebhookEvents(
  payload: Record<string, unknown>,
  topicHeader?: string,
): WebhookEvent[] {
  const topic =
    topicHeader ??
    (payload['topic'] as string | undefined) ??
    (payload['__topic'] as string | undefined) ??
    ''
  const { resourceType, action } = topic
    ? mapTopic(topic)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'vnda',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const woocommerceWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWooCommerceWebhook,
  parseWebhookEvents: parseWooCommerceWebhookEvents,
}
