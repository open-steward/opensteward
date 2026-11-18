/**
 * BitPay IPN (Instant Payment Notification) webhooks.
 *
 * Signature: BitPay sets `x-signature` to the base64-encoded HMAC-SHA-256 of
 * the JSON webhook body **with all whitespace removed**, keyed with the token
 * used to create the resource (the same POS-facade token used for API auth).
 * Because "whitespace removed" must not strip spaces inside string values, we
 * canonicalise by parsing + re-serialising with no spacing rather than naively
 * regex-stripping the raw bytes.
 *
 * Payload (extended IPN): `{ event: { code, name }, data: { id, status, … } }`.
 * The `event.name` is an `invoice_*` / `refund_*` identifier; `data.id` is the
 * resource id and `data.status` the lifecycle state.
 *
 * Docs: https://developer.bitpay.com/reference/hmac-verification
 *       https://developer.bitpay.com/reference/notifications-invoices
 *       https://developer.bitpay.com/reference/notification-codes
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  invoice: 'charges',
  refund: 'refunds',
  payout: 'payouts',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  paidinfull: 'paid',
  confirmed: 'succeeded',
  completed: 'succeeded',
  expired: 'cancelled',
  failedtoconfirm: 'failed',
  declined: 'failed',
  refundcomplete: 'refunded',
  created: 'created',
  pending: 'created',
  cancelled: 'cancelled',
  canceled: 'cancelled',
}

/**
 * BitPay `event.name` values are `invoice_*` / `refund_*`, e.g.
 * `invoice_confirmed`, `invoice_refundComplete`, `refund_created`. The leading
 * token is the resource; the remainder (lower-cased, underscores dropped) is
 * the verb.
 */
function classify(eventName: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const lowered = eventName.toLowerCase()
  const underscore = lowered.indexOf('_')
  if (underscore === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = lowered.slice(0, underscore)
  const verb = lowered.slice(underscore + 1).replace(/_/g, '')
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/** Canonicalise to BitPay's "whitespace removed" form: parse → compact JSON. */
function canonicalBody(payload: Buffer): string {
  const text = payload.toString('utf8')
  try {
    return JSON.stringify(JSON.parse(text))
  } catch {
    // Not valid JSON — fall back to the raw bytes as a last resort.
    return text
  }
}

export function verifyBitpayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = headers['x-signature'] ?? headers['X-Signature']
    if (!sig || !secret) return false
    const expected = createHmac('sha256', secret).update(canonicalBody(payload)).digest('base64')
    const a = Buffer.from(sig, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseBitpayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = (payload['event'] as Record<string, unknown> | undefined) ?? {}
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const eventName = String(event['name'] ?? '')
  const resourceId = String(data['id'] ?? data['orderId'] ?? '')
  const { resourceType, action } = classify(eventName)
  return [
    {
      platform: 'bitpay',
      type: eventName,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const BitpayWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBitpayWebhook,
  parseWebhookEvents: parseBitpayWebhookEvents,
}
