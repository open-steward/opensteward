/**
 * Fawry "Server-to-Server Notification V2" callback.
 *
 * When an order's status changes, Fawry POSTs a JSON notification to the
 * merchant's `orderWebHookUrl`. Unlike most gateways, the signature is NOT a
 * header HMAC of the raw body — it is a field **inside** the JSON payload
 * (`messageSignature`), computed as a SHA-256 hex digest of selected fields
 * concatenated with the merchant `secureKey`:
 *
 *   messageSignature = SHA-256(
 *     fawryRefNumber + merchantRefNumber +
 *     paymentAmount(2dp) + orderAmount(2dp) +
 *     orderStatus + paymentMethod +
 *     paymentReferenceNumber? + secureKey )
 *
 * To fit the `verifyWebhook(payload, headers, secret)` seam, `payload` is the
 * raw request body (parsed here to read the signed fields) and `secret` is the
 * merchant `secureKey`. We recompute the digest and compare in constant time.
 *
 * Docs: https://developer.fawrystaging.com/docs/sdks/payment-notifications/server-notification-v2
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const ACTION_MAP: Record<string, WebhookAction> = {
  NEW: 'created',
  UNPAID: 'created',
  PAID: 'paid',
  DELIVERED: 'paid',
  REFUNDED: 'refunded',
  PARTIAL_REFUNDED: 'refunded',
  CANCELED: 'cancelled',
  EXPIRED: 'cancelled',
  FAILED: 'failed',
}

/** Format a Fawry amount into the two-decimal string used by the signature. */
function amount2dp(v: unknown): string {
  if (v == null || v === '') return ''
  const n = typeof v === 'string' ? Number(v) : (v as number)
  if (Number.isNaN(n)) return ''
  return n.toFixed(2)
}

function pick(payload: Record<string, unknown>, key: string): string {
  const v = payload[key]
  return v == null ? '' : String(v)
}

/**
 * Recompute the Fawry callback `messageSignature` from the payload fields and
 * compare it (constant-time) against the supplied value.
 */
export function verifyFawryWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const provided = body['messageSignature']
    if (typeof provided !== 'string' || provided.length === 0) return false

    const concatenated =
      pick(body, 'fawryRefNumber') +
      pick(body, 'merchantRefNumber') +
      amount2dp(body['paymentAmount']) +
      amount2dp(body['orderAmount']) +
      pick(body, 'orderStatus') +
      pick(body, 'paymentMethod') +
      pick(body, 'paymentReferenceNumber') +
      secret
    const expected = createHash('sha256').update(concatenated, 'utf8').digest('hex')

    const a = Buffer.from(provided.toLowerCase(), 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseFawryWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const status = String(payload['orderStatus'] ?? '').toUpperCase()
  const resourceType: WebhookResourceType = 'charges'
  const action: WebhookAction = ACTION_MAP[status] ?? 'unknown'
  const resourceId = String(
    payload['fawryRefNumber'] ?? payload['merchantRefNumber'] ?? '',
  )
  return [
    {
      id: payload['requestId'] != null ? String(payload['requestId']) : undefined,
      platform: 'fawry',
      type: status ? `order.${status.toLowerCase()}` : 'order',
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const FawryWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFawryWebhook,
  parseWebhookEvents: parseFawryWebhookEvents,
}
