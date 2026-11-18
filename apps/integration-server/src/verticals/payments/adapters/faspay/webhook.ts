/**
 * Faspay Payment Notification (callback) verification + parsing.
 *
 * Faspay POSTs a JSON notification to the merchant's `url_notif` on every
 * payment-status change. Authenticity is proven by a `signature` field **inside
 * the body** (Faspay does not use a signature header):
 *
 *   signature = sha1( md5( user_id + password + bill_no + payment_status_code ) )
 *
 * The framework hands `verifyWebhook` the raw body Buffer plus a single
 * configured `secret`. We encode the two Faspay signing inputs as
 * `userId:password` in that secret (the same convention the merchant configures
 * when registering the notification URL), recompute the expected signature over
 * the body's `bill_no` + `payment_status_code`, and compare in constant time
 * against the `signature` carried in the body.
 *
 * The merchant must ACK with `{ response, trx_id, merchant_id, bill_no,
 * response_code: "00", response_desc: "Success" }`; that ACK is emitted by the
 * router, not here.
 *
 * Docs: https://docs.faspay.co.id/merchant-integration/api-reference-1/debit-transaction/payment-notification
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'
import { signNotification } from './auth'

/** Map a Faspay `payment_status_code` onto a canonical webhook action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  '0': 'created',
  '1': 'created',
  '2': 'paid',
  '3': 'failed',
  '4': 'refunded',
  '5': 'failed',
  '7': 'cancelled',
  '8': 'cancelled',
  '9': 'unknown',
}

function classify(paymentStatusCode: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  // Every Faspay notification concerns a transaction (canonical: a charge).
  return {
    resourceType: 'charges',
    action: ACTION_MAP[paymentStatusCode] ?? 'unknown',
  }
}

/**
 * Split the configured secret into Faspay's two signing inputs. The secret is
 * stored as `userId:password`; if no colon is present the whole value is taken
 * as the password and the userId is empty.
 */
function splitSecret(secret: string): { userId: string; password: string } {
  const idx = secret.indexOf(':')
  if (idx === -1) return { userId: '', password: secret }
  return { userId: secret.slice(0, idx), password: secret.slice(idx + 1) }
}

export function verifyFaspayWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const provided = typeof body['signature'] === 'string' ? (body['signature'] as string) : ''
    if (!provided) return false
    const billNo = String(body['bill_no'] ?? '')
    const statusCode = String(body['payment_status_code'] ?? '')
    const { userId, password } = splitSecret(secret)
    const expected = signNotification(userId, password, billNo, statusCode)
    const a = Buffer.from(provided, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseFaspayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const statusCode = String(payload['payment_status_code'] ?? '')
  const statusDesc = String(payload['payment_status_desc'] ?? '').toLowerCase().replace(/\s+/g, '_')
  const resourceId = String(payload['trx_id'] ?? payload['bill_no'] ?? '')
  const { resourceType, action } = classify(statusCode)
  return [
    {
      platform: 'faspay',
      type: `payment.${statusDesc || statusCode || 'unknown'}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

/** Recompute a Faspay notification signature — exposed for the verification path and tests. */
export { signNotification }

export const FaspayWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFaspayWebhook,
  parseWebhookEvents: parseFaspayWebhookEvents,
}
