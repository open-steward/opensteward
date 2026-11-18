/**
 * iyzico webhook verification + event parsing.
 *
 * iyzico signs deliveries with an HMAC-SHA256 hash carried hex-encoded in the
 * `X-IYZ-SIGNATURE-V3` header, keyed by the merchant secret key. The signed
 * string depends on the payload format:
 *
 *   Direct (non-3DS / 3DS):
 *     secretKey + iyziEventType + paymentId + paymentConversationId + status
 *   HPP (PayWithiyzico / CheckoutForm — carries a `token`):
 *     secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status
 *   Subscription (iyziEventType `subscription.*`):
 *     merchantId + secretKey + iyziEventType + subscriptionReferenceCode +
 *     orderReferenceCode + customerReferenceCode
 *
 * (X-Iyz-Signature and X-Iyz-Signature-V2 are deprecated; only V3 is verified.)
 *
 * Docs: https://docs.iyzico.com/en/advanced/webhook
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const SIGNATURE_HEADER = 'x-iyz-signature-v3'

function header(headers: Record<string, string>, name: string): string | undefined {
  return headers[name] ?? headers[name.toUpperCase()] ?? headers[name.toLowerCase()]
}

/** Pull a stringy field off the parsed payload (tolerant of casing variants). */
function field(payload: Record<string, unknown>, key: string): string {
  const v = payload[key]
  return v == null ? '' : String(v)
}

/**
 * Build the format-specific HMAC-SHA256 signing string. iyzico distinguishes
 * the three formats by which fields are present: a `token` marks HPP, an
 * `iyziEventType` starting `subscription.` marks subscription, otherwise it's
 * the Direct format.
 */
export function buildSignedString(payload: Record<string, unknown>, secret: string): string {
  const eventType = field(payload, 'iyziEventType')
  const conversationId = field(payload, 'paymentConversationId')
  const status = field(payload, 'status')

  if (eventType.startsWith('subscription.')) {
    return (
      field(payload, 'merchantId') +
      secret +
      eventType +
      field(payload, 'subscriptionReferenceCode') +
      field(payload, 'orderReferenceCode') +
      field(payload, 'customerReferenceCode')
    )
  }

  if (payload['token'] != null) {
    // HPP format (PayWithiyzico / CheckoutForm).
    return (
      secret +
      eventType +
      field(payload, 'iyziPaymentId') +
      field(payload, 'token') +
      conversationId +
      status
    )
  }

  // Direct format (non-3DS / 3DS).
  return secret + eventType + field(payload, 'paymentId') + conversationId + status
}

export function verifyIyzicoWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const sig = header(headers, SIGNATURE_HEADER)
    if (!sig || !secret) return false
    const parsed = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const signed = buildSignedString(parsed, secret)
    const expected = createHmac('sha256', secret).update(signed).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/** Map an iyzico event type to a canonical resource type. */
function resourceFor(eventType: string): WebhookResourceType {
  const t = eventType.toLowerCase()
  if (t.startsWith('subscription')) return 'subscriptions'
  if (t.includes('refund')) return 'refunds'
  // PAYMENT_API, API_AUTH, THREE_DS_AUTH, BKM_AUTH, CHECKOUT_FORM_AUTH,
  // BANK_TRANSFER_AUTH, CONTACTLESS_AUTH, … all describe a payment.
  return 'charges'
}

/** Map an iyzico delivery to a canonical action via its `status`/event type. */
function actionFor(eventType: string, status: string): WebhookAction {
  const t = eventType.toLowerCase()
  if (t.includes('refund')) return 'refunded'
  switch (status.toUpperCase()) {
    case 'SUCCESS':
      return t.startsWith('subscription') ? 'succeeded' : 'paid'
    case 'FAILURE':
      return 'failed'
    case 'INIT_THREEDS':
    case 'CALLBACK_THREEDS':
    case 'INIT_APM':
    case 'INIT_CONTACTLESS':
    case 'BKM_POS_SELECTED':
      return 'created'
    default:
      return t.endsWith('.success') ? 'succeeded' : t.endsWith('.failure') ? 'failed' : 'unknown'
  }
}

export function parseIyzicoWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = field(payload, 'iyziEventType')
  const status = field(payload, 'status')
  const resourceId = String(
    payload['iyziPaymentId'] ??
      payload['paymentId'] ??
      payload['subscriptionReferenceCode'] ??
      payload['paymentConversationId'] ??
      payload['iyziReferenceCode'] ??
      '',
  )
  return [
    {
      id: field(payload, 'iyziReferenceCode') || undefined,
      platform: 'iyzico',
      type: eventType || 'unknown',
      resourceType: resourceFor(eventType),
      action: actionFor(eventType, status),
      resourceId,
      payload,
    },
  ]
}

export const IyzicoWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyIyzicoWebhook,
  parseWebhookEvents: parseIyzicoWebhookEvents,
}
