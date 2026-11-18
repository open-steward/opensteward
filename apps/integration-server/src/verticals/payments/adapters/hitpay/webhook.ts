/**
 * HitPay webhook verification.
 *
 * Modern *event* webhooks (configured under Settings → Webhooks) ship the
 * signature in the `Hitpay-Signature` header, computed as
 * `HMAC-SHA256(rawBody, salt)` and hex-encoded, where `salt` is the merchant's
 * dashboard salt value.
 *
 * The legacy payment-request callback instead posts form params with an inline
 * `hmac` field: the params are sorted by key (`ksort`), concatenated as
 * `key1val1key2val2…`, and HMAC-SHA256'd with the salt. We accept both.
 *
 * Docs: https://docs.hitpayapp.com/apis/guide/events
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { verifyHmacSha256, type WebhookHandler } from '@opensteward/shared'
import { WEBHOOK_SIGNATURE_HEADER } from './constants'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

function constantTimeEqualHex(a: string, b: string): boolean {
  try {
    const ba = Buffer.from(a, 'hex')
    const bb = Buffer.from(b, 'hex')
    if (ba.length !== bb.length || ba.length === 0) return false
    return timingSafeEqual(ba, bb)
  } catch {
    return false
  }
}

/**
 * Legacy callback: HMAC-SHA256 of the ksort-concatenated form params (every
 * field except `hmac`) using the salt, compared to the inline `hmac` field.
 */
function verifyLegacyHmac(payload: Buffer, secret: string): boolean {
  try {
    const parsed = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const supplied = parsed['hmac']
    if (typeof supplied !== 'string' || !supplied) return false
    const source = Object.keys(parsed)
      .filter((k) => k !== 'hmac')
      .sort()
      .map((k) => `${k}${String(parsed[k] ?? '')}`)
      .join('')
    const expected = createHmac('sha256', secret).update(source).digest('hex')
    return constantTimeEqualHex(supplied, expected)
  } catch {
    return false
  }
}

export function verifyHitpayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false
  const header =
    headers[WEBHOOK_SIGNATURE_HEADER] ?? headers['Hitpay-Signature'] ?? headers['HitPay-Signature']
  // Modern event webhook: hex HMAC-SHA256 of the raw body in the header.
  if (header && verifyHmacSha256(payload, secret, header, 'hex')) return true
  // Legacy payment-request callback: inline `hmac` over ksort'd params.
  return verifyLegacyHmac(payload, secret)
}

/**
 * Classify a HitPay webhook payload. Event webhooks carry an `event_type`
 * (e.g. `charge.completed`); legacy callbacks carry a payment `status`
 * (`completed`, `failed`, …) and a `payment_id` / `payment_request_id`.
 */
function classify(payload: Record<string, unknown>): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const eventType = String(payload['event_type'] ?? payload['event'] ?? '').toLowerCase()
  if (eventType.startsWith('refund')) return { resourceType: 'refunds', action: 'refunded' }
  if (eventType.startsWith('charge') || eventType.startsWith('payment')) {
    if (eventType.endsWith('failed')) return { resourceType: 'charges', action: 'failed' }
    return { resourceType: 'charges', action: 'paid' }
  }

  // Legacy callback — infer from `status`.
  const status = String(payload['status'] ?? '').toLowerCase()
  if (payload['refunded_amount'] != null || payload['amount_refunded'] != null) {
    return { resourceType: 'refunds', action: 'refunded' }
  }
  switch (status) {
    case 'completed':
    case 'succeeded':
      return { resourceType: 'charges', action: 'paid' }
    case 'failed':
      return { resourceType: 'charges', action: 'failed' }
    case 'expired':
      return { resourceType: 'charges', action: 'cancelled' }
    default:
      return { resourceType: 'charges', action: 'unknown' }
  }
}

export function parseHitpayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const { resourceType, action } = classify(payload)
  const eventType = String(
    payload['event_type'] ?? payload['event'] ?? `payment.${String(payload['status'] ?? 'unknown')}`,
  )
  const resourceId = String(
    payload['payment_request_id'] ?? payload['payment_id'] ?? payload['id'] ?? '',
  )
  return [
    {
      platform: 'hitpay',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const HitpayWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyHitpayWebhook,
  parseWebhookEvents: parseHitpayWebhookEvents,
}
