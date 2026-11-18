/**
 * Geidea callback (webhook) verification + event parsing.
 *
 * Geidea signs each callback with an HMAC-SHA-256, keyed on the merchant's
 * **API password**, over the concatenation of (in this exact order):
 *
 *   merchantPublicKey + orderAmount + orderCurrency + orderId + status +
 *   merchantReferenceId + timeStamp
 *
 * The digest is Base64-encoded and delivered in the `signature` field of the
 * callback body. Merchants regenerate the signature with the same logic and
 * compare. The `secret` passed here is the merchant API password.
 *
 * `orderAmount` must be formatted exactly as Geidea sent it (a major-unit
 * decimal). We read the amount straight off the payload as a string so the
 * comparison is byte-for-byte; `merchantReferenceId` is optional and contributes
 * an empty string when absent.
 *
 * Docs: https://docs.geidea.net/docs/sample-callback-responses
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

function str(v: unknown): string {
  return v === null || v === undefined ? '' : String(v)
}

/**
 * Rebuild the signature string Geidea hashes. The amount is emitted exactly as
 * received so the HMAC matches the merchant-side computation.
 */
function signatureSource(order: Record<string, unknown>): string {
  return (
    str(order['merchantPublicKey']) +
    str(order['amount']) +
    str(order['currency']) +
    str(order['orderId']) +
    str(order['status']) +
    str(order['merchantReferenceId']) +
    str(order['timeStamp'] ?? order['timestamp'])
  )
}

export function verifyGeideaWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const order = (body['order'] as Record<string, unknown> | undefined) ?? body
    const provided = str(order['signature'] ?? body['signature'])
    if (!provided) return false
    const expected = createHmac('sha256', secret).update(signatureSource(order)).digest('base64')
    const a = Buffer.from(provided, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

const DETAILED_STATUS_ACTION: Record<string, WebhookAction> = {
  paid: 'paid',
  captured: 'paid',
  authorized: 'created',
  refunded: 'refunded',
  partiallyrefunded: 'refunded',
  voided: 'cancelled',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  expired: 'cancelled',
  failed: 'failed',
  orderfailed: 'failed',
  declined: 'failed',
  chargedback: 'unknown',
}

const STATUS_ACTION: Record<string, WebhookAction> = {
  success: 'paid',
  failed: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

/**
 * Geidea callbacks describe a single order. Classify the canonical resource +
 * action from the order's `detailedStatus` (preferred) or `status`. Refund
 * states map to the `refunds` resource; everything else to `charges`.
 */
function classify(order: Record<string, unknown>): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const detailed = str(order['detailedStatus']).toLowerCase()
  const action =
    DETAILED_STATUS_ACTION[detailed] ??
    STATUS_ACTION[str(order['status']).toLowerCase()] ??
    'unknown'
  const resourceType: WebhookResourceType = action === 'refunded' ? 'refunds' : 'charges'
  return { resourceType, action }
}

export function parseGeideaWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const order = (payload['order'] as Record<string, unknown> | undefined) ?? payload
  const { resourceType, action } = classify(order)
  const type = `order.${str(order['detailedStatus'] ?? order['status']).toLowerCase() || 'unknown'}`
  return [
    {
      platform: 'geidea',
      type,
      resourceType,
      action,
      resourceId: str(order['orderId'] ?? order['merchantReferenceId']),
      payload,
    },
  ]
}

export const GeideaWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyGeideaWebhook,
  parseWebhookEvents: parseGeideaWebhookEvents,
}
