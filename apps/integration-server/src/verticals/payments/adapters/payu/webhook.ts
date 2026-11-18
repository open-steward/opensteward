/**
 * PayU signs order/refund notifications with the `OpenPayu-Signature` header.
 * The header is a semicolon-delimited key=value list, e.g.
 *
 *   sender=checkout;signature=c33a38d89fb60f873c039fcec3a14743;algorithm=MD5;content=DOCUMENT
 *
 * The expected signature is `HASH(rawBody + secondKey)`, where `secondKey` is
 * the merchant's "Second key (MD5)" from the POS configuration and `HASH` is
 * the algorithm named in the header (PayU emits MD5 by default but also
 * supports SHA-1/SHA-256). The hash MUST run over the RAW request body —
 * re-serialising the parsed JSON would change the byte sequence and break the
 * comparison.
 *
 * Notification bodies carry either an `order` object (status changes:
 * PENDING → WAITING_FOR_CONFIRMATION → COMPLETED / CANCELED) or a `refund`
 * object alongside the `orderId`.
 *
 * Docs: https://developers.payu.com/europe/docs/payment-flows/notifications/
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Map a PayU header algorithm token to a Node hash name. */
const ALGORITHMS: Record<string, string> = {
  MD5: 'md5',
  SHA1: 'sha1',
  'SHA-1': 'sha1',
  SHA256: 'sha256',
  'SHA-256': 'sha256',
  SHA384: 'sha384',
  'SHA-512': 'sha512',
  SHA512: 'sha512',
}

/** Parse the `OpenPayu-Signature` header into a key→value map. */
export function parseSignatureHeader(header: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of header.split(';')) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    const key = part.slice(0, eq).trim().toLowerCase()
    const value = part.slice(eq + 1).trim()
    if (key) out[key] = value
  }
  return out
}

export function verifyPayuWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const header =
      headers['openpayu-signature'] ??
      headers['OpenPayu-Signature'] ??
      headers['x-openpayu-signature']
    if (!header || !secret) return false
    const parsed = parseSignatureHeader(header)
    const incoming = parsed['signature']
    if (!incoming) return false
    const algo = ALGORITHMS[(parsed['algorithm'] ?? 'MD5').toUpperCase()] ?? 'md5'

    const expected = createHash(algo)
      .update(Buffer.concat([payload, Buffer.from(secret, 'utf8')]))
      .digest('hex')

    const a = Buffer.from(incoming.toLowerCase(), 'utf8')
    const b = Buffer.from(expected.toLowerCase(), 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Map a PayU order status to a canonical webhook action. */
const ORDER_ACTION_MAP: Record<string, WebhookAction> = {
  NEW: 'created',
  PENDING: 'created',
  WAITING_FOR_CONFIRMATION: 'updated',
  COMPLETED: 'paid',
  CANCELED: 'cancelled',
  CANCELLED: 'cancelled',
  REJECTED: 'failed',
}

/** Map a PayU refund status to a canonical webhook action. */
const REFUND_ACTION_MAP: Record<string, WebhookAction> = {
  PENDING: 'created',
  FINALIZED: 'refunded',
  CANCELED: 'cancelled',
  CANCELLED: 'cancelled',
}

export function parsePayuWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const order = payload['order'] as Record<string, unknown> | undefined
  const refund = (payload['refund'] ??
    order?.['refund']) as Record<string, unknown> | undefined

  // Refund notifications carry a `refund` block alongside the order id.
  if (refund) {
    const status = String(refund['status'] ?? '').toUpperCase()
    const resourceType: WebhookResourceType = 'refunds'
    return [
      {
        platform: 'payu',
        type: `refund.${status.toLowerCase() || 'unknown'}`,
        resourceType,
        action: REFUND_ACTION_MAP[status] ?? 'unknown',
        resourceId: String(refund['refundId'] ?? refund['extRefundId'] ?? ''),
        payload,
      },
    ]
  }

  const status = String(order?.['status'] ?? '').toUpperCase()
  const resourceType: WebhookResourceType = order ? 'charges' : 'unknown'
  return [
    {
      platform: 'payu',
      type: `order.${status.toLowerCase() || 'unknown'}`,
      resourceType,
      action: order ? (ORDER_ACTION_MAP[status] ?? 'updated') : 'unknown',
      resourceId: String(order?.['orderId'] ?? order?.['extOrderId'] ?? ''),
      payload,
    },
  ]
}

export const PayuWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPayuWebhook,
  parseWebhookEvents: parsePayuWebhookEvents,
}
