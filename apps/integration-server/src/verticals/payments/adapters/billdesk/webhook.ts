/**
 * BillDesk signs webhook ("LCM notification") payloads as a compact JWS
 * (`application/jose`): the notification JSON is HMAC-SHA-256 signed (`alg:
 * HS256`) with the merchant's shared secret key — the same `secretkey` used to
 * sign API requests — with the `clientid` in the JWS protected header. The
 * entire signed object is POSTed to the merchant URL as the raw body.
 *
 * Verification recomputes the HMAC over the `<header>.<payload>` signing input
 * and compares it (constant-time) against the trailing signature segment. The
 * decoded payload carries `objectid` (transaction / mandate / invoice /
 * card_account) plus the updated object's fields.
 *
 * Docs: https://docs.billdesk.io/docs/webhooks-lcm-notifications
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  transaction: 'charges',
  refund: 'refunds',
  mandate: 'subscriptions',
  invoice: 'invoices',
  card_account: 'payment_methods',
  cardaccount: 'payment_methods',
}

/**
 * BillDesk transaction `auth_status` / refund `refund_status` codes drive the
 * canonical action. Anything we don't recognise maps to `updated` (the object
 * changed) rather than `unknown`, since every notification is an update event.
 */
function actionFor(object: Record<string, unknown>, resourceType: WebhookResourceType): WebhookAction {
  const auth = String(object['auth_status'] ?? '').trim()
  const refundStatus = String(object['refund_status'] ?? '').trim()
  if (resourceType === 'charges') {
    if (auth === '0300') return 'succeeded'
    if (auth === '0399') return 'failed'
    return 'updated'
  }
  if (resourceType === 'refunds') {
    if (refundStatus === '0799' || refundStatus === '0699') return 'refunded'
    return 'updated'
  }
  const status = String(object['status'] ?? '').toLowerCase()
  if (status.includes('cancel') || status.includes('delete')) return 'cancelled'
  if (status.includes('create')) return 'created'
  return 'updated'
}

/**
 * Split a compact JWS into its `<header>.<payload>.<signature>` parts and
 * decode the middle (payload) segment to JSON. Returns `{}` when the token is
 * malformed so callers never throw.
 */
function decodeJwsPayload(token: string): Record<string, unknown> {
  try {
    const parts = token.split('.')
    if (parts.length < 2) return {}
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')) as Record<string, unknown>
  } catch {
    return {}
  }
}

export function verifyBilldeskWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const token = payload.toString('utf8').trim()
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [header, body, signature] = parts
    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    const a = Buffer.from(signature, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Parse a BillDesk notification into canonical webhook events.
 *
 * The router may hand us either the already-decoded JSON object (when the
 * platform layer unwrapped the JWS) or `{ jws: "<token>" }` / a raw token
 * wrapper. We accept the decoded object directly; if it looks like a compact
 * JWS string under a `jws`/`token` key we decode it first.
 */
export function parseBilldeskWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  let object = payload
  const wrapped = payload['jws'] ?? payload['token']
  if (typeof wrapped === 'string') object = decodeJwsPayload(wrapped)

  const objectId = String(object['objectid'] ?? '').toLowerCase()
  const resourceType = RESOURCE_MAP[objectId] ?? 'unknown'
  const action = actionFor(object, resourceType)
  const resourceId = String(
    object['transactionid'] ??
      object['refundid'] ??
      object['mandateid'] ??
      object['cardaccountid'] ??
      object['orderid'] ??
      object['objectid'] ??
      '',
  )
  return [
    {
      platform: 'billdesk',
      type: objectId || 'notification',
      resourceType,
      action,
      resourceId,
      payload: object,
    },
  ]
}

export const BilldeskWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBilldeskWebhook,
  parseWebhookEvents: parseBilldeskWebhookEvents,
}
