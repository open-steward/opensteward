/**
 * CoinGate does NOT sign callbacks with an HMAC or asymmetric signature.
 * Instead, every order is issued a high-entropy `token` at creation time
 * (returned on the order object, e.g. `"PsPXSa46uohMtMWqfzTrnwy3p3sNmQ"`),
 * and the callback echoes that same `token` in its body. The merchant
 * verifies authenticity by constant-time-comparing the callback's `token`
 * against the token it stored for that order.
 *
 * To fit the `verifyWebhook(payload, headers, secret)` seam, `secret` is the
 * order's stored token. We parse the raw body, pull `token`, and compare it
 * to `secret` with a length-safe `timingSafeEqual`. (The `headers` argument
 * is unused — CoinGate carries the verifier in the body, not a header.)
 *
 * Docs: https://developer.coingate.com/reference/api-callbacks
 *       https://developer.coingate.com/reference/payment-callback
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Map a CoinGate order/refund `status` to the canonical webhook action. The
 * callback body is flat — the `status` field is the verb. The resource type
 * is inferred from which callback fired (payment vs refund).
 */
const ORDER_ACTION_MAP: Record<string, WebhookAction> = {
  new: 'created',
  pending: 'created',
  confirming: 'updated',
  paid: 'paid',
  invalid: 'failed',
  expired: 'failed',
  canceled: 'cancelled',
  cancelled: 'cancelled',
  refunded: 'refunded',
  partially_refunded: 'refunded',
}

const REFUND_ACTION_MAP: Record<string, WebhookAction> = {
  pending: 'created',
  processing: 'updated',
  completed: 'succeeded',
  rejected: 'failed',
}

/**
 * A payment callback carries `price_amount`/`price_currency`; a refund
 * callback carries `request_amount`/`refund_amount`. We sniff the shape to
 * decide the resource type, since CoinGate callbacks are untyped flat bodies.
 */
function classify(payload: Record<string, unknown>): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const status = String(payload['status'] ?? '').toLowerCase()
  const isRefund =
    payload['refund_amount'] !== undefined || payload['request_amount'] !== undefined
  if (isRefund) {
    return { resourceType: 'refunds', action: REFUND_ACTION_MAP[status] ?? 'unknown' }
  }
  return { resourceType: 'charges', action: ORDER_ACTION_MAP[status] ?? 'unknown' }
}

export function verifyCoingateWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const token = body['token']
    if (typeof token !== 'string' || token.length === 0) return false
    const a = Buffer.from(token, 'utf8')
    const b = Buffer.from(secret, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseCoingateWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const { resourceType, action } = classify(payload)
  const resourceId = String(payload['id'] ?? payload['order_id'] ?? '')
  const status = String(payload['status'] ?? '')
  return [
    {
      id: payload['id'] != null ? String(payload['id']) : undefined,
      platform: 'coingate',
      type: `${resourceType === 'refunds' ? 'refund' : 'order'}.${status}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const CoingateWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCoingateWebhook,
  parseWebhookEvents: parseCoingateWebhookEvents,
}
