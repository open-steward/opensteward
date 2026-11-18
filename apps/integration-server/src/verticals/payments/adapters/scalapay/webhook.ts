/**
 * Scalapay webhook verification + event parsing.
 *
 * Scalapay signs each delivery with HMAC-SHA256 keyed by the merchant's
 * api-key. The signature covers a concatenated signing string of the form:
 *
 *   `{version}:{timestamp}:{JSON.stringify(payload)}`
 *
 * where `version` is always the string `"V1"` and `timestamp` is the Unix
 * millisecond timestamp carried in the `x-scalapay-timestamp` header. The
 * hex-encoded HMAC arrives in `x-scalapay-hmac-v1`.
 *
 * (Some HTTP stacks mangle header case so we look up headers
 * case-insensitively.)
 *
 * Notification payloads carry the order/payment `token`, the new `status`
 * (CHARGED / AUTHORIZED / CANCELLED / EXPIRED / DECLINED / REFUNDED), the
 * `merchantReference`, and the `eventType`.
 *
 * Docs: https://developers.scalapay.com/reference/messages-validation
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

const SIGNATURE_HEADER = 'x-scalapay-hmac-v1'
const TIMESTAMP_HEADER = 'x-scalapay-timestamp'
const SIGNING_VERSION = 'V1'

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const direct = headers[name]
  if (direct) return direct
  const lowered = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lowered) return v
  }
  return undefined
}

export function verifyScalapayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headerValue(headers, SIGNATURE_HEADER)
    if (!sig) return false
    const timestamp = headerValue(headers, TIMESTAMP_HEADER)
    if (!timestamp) return false

    // Parse the raw body as JSON to re-serialise it deterministically.
    // JSON.stringify(JSON.parse(body)) reproduces the canonical signing string.
    const parsed: unknown = JSON.parse(payload.toString('utf8'))
    const signingString = `${SIGNING_VERSION}:${timestamp}:${JSON.stringify(parsed)}`

    const expected = createHmac('sha256', secret).update(signingString).digest('hex')
    const a = Buffer.from(sig.trim(), 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Scalapay notifications are order/payment status changes, so every event maps
 * to the `charges` canonical resource. We classify the action from the order
 * status carried in the payload.
 */
const STATUS_ACTION_MAP: Record<string, WebhookAction> = {
  CHARGED: 'paid',
  AUTHORIZED: 'created',
  PENDING: 'created',
  DECLINED: 'failed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
  VOIDED: 'cancelled',
  EXPIRED: 'cancelled',
  REFUNDED: 'refunded',
}

function classify(payload: Record<string, unknown>): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const status = String(payload['status'] ?? '').toUpperCase()
  const eventType = String(payload['eventType'] ?? payload['type'] ?? '').toLowerCase()
  const resourceType: WebhookResourceType = eventType.includes('refund') ? 'refunds' : 'charges'
  return {
    resourceType,
    action: STATUS_ACTION_MAP[status] ?? 'unknown',
  }
}

export function parseScalapayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const status = String(payload['status'] ?? '')
  const eventType = String(payload['eventType'] ?? payload['type'] ?? status)
  const resourceId = String(payload['token'] ?? payload['orderToken'] ?? payload['refundToken'] ?? '')
  const { resourceType, action } = classify(payload)
  return [
    {
      platform: 'scalapay',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const ScalapayWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyScalapayWebhook,
  parseWebhookEvents: parseScalapayWebhookEvents,
}
