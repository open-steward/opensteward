/**
 * Midtrans sends HTTP notifications (webhooks) as a POST with a JSON body
 * that mirrors the Core API transaction-status payload. Unlike most gateways
 * the signature ships **inside the body** (`signature_key`), not in a header:
 *
 *   signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)
 *
 * The Server Key is the same confidential key used for API auth, so the
 * `verifyWebhook(payload, headers, secret)` seam receives it as `secret`. We
 * recompute the digest over the body's `order_id` / `status_code` /
 * `gross_amount` and compare in constant time against `signature_key`.
 *
 * Docs:
 *   https://docs.midtrans.com/docs/https-notification-webhooks
 *   https://docs.midtrans.com/reference/handling-notifications
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Every Midtrans notification describes a single transaction, so the resource
 * type is always `charges`; the canonical action is derived from
 * `transaction_status`.
 */
const ACTION_MAP: Record<string, WebhookAction> = {
  capture: 'paid',
  settlement: 'paid',
  authorize: 'created',
  pending: 'created',
  deny: 'failed',
  failure: 'failed',
  expire: 'failed',
  cancel: 'cancelled',
  refund: 'refunded',
  partial_refund: 'refunded',
}

function classify(transactionStatus: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  return {
    resourceType: 'charges',
    action: ACTION_MAP[transactionStatus.toLowerCase()] ?? 'unknown',
  }
}

export function verifyMidtransWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const provided = body['signature_key']
    if (typeof provided !== 'string' || !provided) return false
    const orderId = String(body['order_id'] ?? '')
    const statusCode = String(body['status_code'] ?? '')
    const grossAmount = String(body['gross_amount'] ?? '')
    const expected = createHash('sha512')
      .update(orderId + statusCode + grossAmount + secret)
      .digest('hex')
    const a = Buffer.from(provided.toLowerCase(), 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseMidtransWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const transactionStatus = String(payload['transaction_status'] ?? '')
  const resourceId = String(payload['order_id'] ?? payload['transaction_id'] ?? '')
  const { resourceType, action } = classify(transactionStatus)
  return [
    {
      id: payload['transaction_id'] != null ? String(payload['transaction_id']) : undefined,
      platform: 'midtrans',
      type: transactionStatus ? `transaction.${transactionStatus}` : 'transaction',
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const MidtransWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyMidtransWebhook,
  parseWebhookEvents: parseMidtransWebhookEvents,
}
