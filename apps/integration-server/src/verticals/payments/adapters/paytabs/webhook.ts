/**
 * PayTabs signs its Instant Payment Notification (IPN) callbacks with an
 * HMAC-SHA-256 of the raw request body, keyed by the profile's **Server Key**
 * (the same key used for API auth). The signature ships hex-encoded in the
 * `signature` request header. Verification recomputes the HMAC over the raw
 * body and compares it to the header in constant time.
 *
 * Docs: https://support.paytabs.com/en/support/solutions/articles/60000718961
 *   ("How to verify the response received from PayTabs? (Signature Verification)")
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Map a PayTabs `tran_type` onto a canonical webhook resource type. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  sale: 'charges',
  auth: 'charges',
  capture: 'charges',
  void: 'charges',
  refund: 'refunds',
  register: 'payment_methods',
}

/** Map a PayTabs `response_status` letter onto a canonical webhook action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  A: 'succeeded',
  H: 'created',
  P: 'created',
  V: 'cancelled',
  C: 'cancelled',
  D: 'failed',
  E: 'failed',
}

function classify(
  tranType: string,
  responseStatus: string,
): { resourceType: WebhookResourceType; action: WebhookAction } {
  const type = tranType.toLowerCase()
  const resourceType = RESOURCE_MAP[type] ?? 'unknown'
  let action: WebhookAction = ACTION_MAP[responseStatus.toUpperCase()] ?? 'unknown'
  // A successful refund is canonically a "refunded" action, not a generic success.
  if (type === 'refund' && action === 'succeeded') action = 'refunded'
  return { resourceType, action }
}

export function verifyPaytabsWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['signature'] ?? headers['Signature']
    if (!sig) return false
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parsePaytabsWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const tranType = String(payload['tran_type'] ?? '')
  const result = (payload['payment_result'] as Record<string, unknown> | undefined) ?? {}
  const responseStatus = String(result['response_status'] ?? '')
  const resourceId = String(payload['tran_ref'] ?? payload['cart_id'] ?? '')
  const { resourceType, action } = classify(tranType, responseStatus)
  return [
    {
      platform: 'paytabs',
      type: `${tranType.toLowerCase() || 'transaction'}.${responseStatus.toLowerCase() || 'unknown'}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PaytabsWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPaytabsWebhook,
  parseWebhookEvents: parsePaytabsWebhookEvents,
}
