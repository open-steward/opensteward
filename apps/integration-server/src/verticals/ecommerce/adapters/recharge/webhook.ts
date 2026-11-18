/**
 * Recharge webhook verification and event parsing.
 *
 * Verification: Recharge signs each webhook request with a SHA-256 digest of
 * (client_secret + request_body_as_string), placing the hex digest in the
 * `X-Recharge-Hmac-Sha256` header. NOTE: the secret is NOT used as an HMAC
 * key — it is prepended to the body before hashing with plain SHA-256:
 *
 *   sha256(client_secret || request_body)
 *
 * The API Client Secret is NOT the same as the store API token. It is found
 * in the Recharge merchant portal: Tools & Apps → API tokens → Edit token →
 * API Client Secret.
 *
 * Event parsing: Recharge includes the `topic` field in the JSON body
 * (e.g. `"customer/created"`, `"order/created"`) which we split on `"/"` to
 * derive the canonical `{ resourceType, action }` pair.
 *
 * Docs: https://docs.getrecharge.com/docs/webhooks-overview
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Verify a Recharge webhook delivery.
 *
 * @param payload - Raw request body Buffer (must not be parsed/modified).
 * @param headers - Request headers (case-insensitive lookup attempted).
 * @param clientSecret - API Client Secret from the Recharge merchant portal.
 */
export function verifyRechargeWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  clientSecret: string,
): boolean {
  try {
    const headerSig =
      headers['x-recharge-hmac-sha256'] ?? headers['X-Recharge-Hmac-Sha256']
    if (!headerSig) return false

    // sha256(client_secret || raw_body) — client secret prepended, not used as HMAC key.
    const hash = createHash('sha256')
    hash.update(clientSecret)
    hash.update(payload)
    const expected = hash.digest('hex')

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
  customer: 'customers',
  order: 'orders',
  charge: 'orders', // charges are the billing analogue of orders
  subscription: 'products', // closest canonical type; subscriptions aren't a canonical resource
  product: 'products',
  address: 'customers', // addresses belong to customers
  discount: 'discounts',
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
  activated: 'updated',
  cancelled: 'updated',
  skipped: 'updated',
  processed: 'updated',
}

function mapTopic(topic: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // Recharge topic format: `<resource>/<action>`, e.g. `order/created`.
  const [group = 'unknown', verb = 'unknown'] = topic.toLowerCase().split('/')
  return {
    resourceType: resolveResource(group),
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Recharge webhook delivery into a canonical WebhookEvent.
 *
 * Recharge delivers a single event per HTTP request, so this always returns
 * an array of length 0 or 1.
 */
export function parseRechargeWebhookEvents(
  payload: Record<string, unknown>,
  topicHeader?: string,
): WebhookEvent[] {
  const topic =
    topicHeader ??
    (payload['topic'] as string | undefined) ??
    ''

  const { resourceType, action } = topic
    ? mapTopic(topic)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'recharge',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const rechargeWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyRechargeWebhook,
  parseWebhookEvents: parseRechargeWebhookEvents,
}
