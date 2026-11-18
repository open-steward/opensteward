/**
 * Cashfree PG signs webhooks with base64(HMAC-SHA-256(`${timestamp}${rawBody}`))
 * keyed with the merchant's secret key (the same `secretKey` used as
 * `x-client-secret` for API auth). The signature ships base64-encoded in
 * `x-webhook-signature`; the timestamp that prefixes the signed payload ships
 * in `x-webhook-timestamp`. The HMAC MUST run over the RAW request body —
 * re-serializing the parsed JSON would change decimal amounts.
 *
 * Webhook `type` values are upper-snake with a `_WEBHOOK` suffix, e.g.
 * `PAYMENT_SUCCESS_WEBHOOK`, `PAYMENT_FAILED_WEBHOOK`, `REFUND_STATUS_WEBHOOK`.
 * The body nests `data.order`, `data.payment`, and/or `data.refund`.
 *
 * Docs: https://www.cashfree.com/docs/payments/online/webhooks/signature-verification
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  refund: 'refunds',
  settlement: 'payouts',
  dispute: 'disputes',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  success: 'succeeded',
  failed: 'failed',
  failure: 'failed',
  user: 'cancelled', // USER_DROPPED
  dropped: 'cancelled',
  cancelled: 'cancelled',
  status: 'updated',
  refunded: 'refunded',
  created: 'created',
  pending: 'created',
}

/**
 * Cashfree event types look like `PAYMENT_SUCCESS_WEBHOOK` or
 * `REFUND_STATUS_WEBHOOK`. The first token is the resource, the middle
 * token(s) the verb, and a trailing `WEBHOOK` we drop.
 */
function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const tokens = eventType
    .toLowerCase()
    .split('_')
    .filter((t) => t && t !== 'webhook')
  const head = tokens[0] ?? ''
  const verb = tokens[1] ?? ''
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyCashfreeWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-webhook-signature'] ?? headers['X-Webhook-Signature']
    const timestamp = headers['x-webhook-timestamp'] ?? headers['X-Webhook-Timestamp'] ?? ''
    if (!sig) return false
    const signedPayload = Buffer.concat([Buffer.from(timestamp, 'utf8'), payload])
    const expected = createHmac('sha256', secret).update(signedPayload).digest('base64')
    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseCashfreeWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['type'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const payment = data['payment'] as Record<string, unknown> | undefined
  const refund = data['refund'] as Record<string, unknown> | undefined
  const order = data['order'] as Record<string, unknown> | undefined

  const resourceId = String(
    refund?.['cf_refund_id'] ??
      refund?.['refund_id'] ??
      payment?.['cf_payment_id'] ??
      order?.['order_id'] ??
      '',
  )
  const { resourceType, action } = classify(eventType)
  return [
    {
      platform: 'cashfree',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const CashfreeWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCashfreeWebhook,
  parseWebhookEvents: parseCashfreeWebhookEvents,
}
