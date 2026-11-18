/**
 * Cielo "Notification Post" (webhook). Cielo POSTs a tiny JSON body when a
 * transaction changes state:
 *
 *   { "PaymentId": "<guid>", "ChangeType": 1, "RecurrentPaymentId"?: "<guid>" }
 *
 * Cielo does NOT sign notifications with an HMAC. Its only authentication
 * mechanism is an *optional static header*: the merchant registers up to three
 * fixed header name/value pairs with Cielo Support, and Cielo echoes them on
 * every notification. Verification is therefore a constant-time comparison of
 * the configured secret against one of the incoming header values — there is
 * no cryptographic signature to recompute.
 *
 * Docs: https://docs.cielo.com.br/ecommerce-cielo-en/docs/notification-post
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Header Cielo echoes when a merchant configures a static notification header.
 * The merchant registers the *value*; the conventional name is
 * `merchantnotificationtoken`, but Cielo lets the merchant pick. We compare
 * against the configured secret across the common candidate header names.
 */
const CANDIDATE_HEADER_NAMES = [
  'merchantnotificationtoken',
  'x-cielo-signature',
  'authorization',
]

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Cielo `ChangeType` → canonical resource/action.
 *   1  Payment status change           → charges / updated
 *   2  Recurrence created              → subscriptions / created
 *   3  Antifraude status change        → charges / updated
 *   4  Recurring payment status change → subscriptions / updated
 *   5  Cancellation denied             → charges / failed
 *   7  Chargeback                       → disputes / disputed
 *   8  Fraud alert                      → disputes / disputed
 *   25 Cancelled / partially refunded   → refunds / refunded
 */
const CHANGE_TYPE_MAP: Record<number, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  1: { resourceType: 'charges', action: 'updated' },
  2: { resourceType: 'subscriptions', action: 'created' },
  3: { resourceType: 'charges', action: 'updated' },
  4: { resourceType: 'subscriptions', action: 'updated' },
  5: { resourceType: 'charges', action: 'failed' },
  7: { resourceType: 'disputes', action: 'disputed' },
  8: { resourceType: 'disputes', action: 'disputed' },
  25: { resourceType: 'refunds', action: 'refunded' },
}

export function verifyCieloWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // No configured secret → Cielo offers no other proof, so we cannot
    // authenticate. Refuse rather than accept silently.
    if (!secret) return false
    const lowered: Record<string, string> = {}
    for (const [k, v] of Object.entries(headers)) lowered[k.toLowerCase()] = v
    for (const name of CANDIDATE_HEADER_NAMES) {
      const value = lowered[name]
      if (value && constantTimeEquals(value, secret)) return true
    }
    return false
  } catch {
    return false
  }
}

export function parseCieloWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const changeTypeRaw = payload['ChangeType'] ?? payload['changeType']
  const changeType = Number(changeTypeRaw)
  const mapped = CHANGE_TYPE_MAP[changeType] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const recurrentId = payload['RecurrentPaymentId'] ?? payload['recurrentPaymentId']
  const paymentId = payload['PaymentId'] ?? payload['paymentId']
  // Recurrence notifications (ChangeType 2/4) key off RecurrentPaymentId.
  const resourceId = String(
    (mapped.resourceType === 'subscriptions' ? recurrentId : paymentId) ?? paymentId ?? '',
  )
  return [
    {
      platform: 'cielo',
      type: `cielo.changeType.${Number.isNaN(changeType) ? 'unknown' : changeType}`,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      payload,
    },
  ]
}

export const CieloWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyCieloWebhook,
  parseWebhookEvents: parseCieloWebhookEvents,
}
