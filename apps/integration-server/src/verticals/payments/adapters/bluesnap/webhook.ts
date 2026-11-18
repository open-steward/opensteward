/**
 * BlueSnap webhooks (a.k.a. IPNs) are form-urlencoded HTTP POSTs.
 *
 * Modern signed webhooks ship two custom headers:
 *   - `bls-ipn-timestamp` — the timestamp BlueSnap signed over.
 *   - `bls-signature`      — HMAC-SHA-256, hex-encoded, of
 *                            `<bls-ipn-timestamp value><raw body>`
 *                            (timestamp first, no separator) keyed by the
 *                            encryption key generated under the webhook
 *                            "Add Security Header" setting.
 *
 * We verify by recomputing that HMAC over `timestamp || rawBody` and
 * constant-time comparing against `bls-signature`. The signing secret is
 * the encryption/security-header key (passed as `secret`).
 *
 * Docs: https://support.bluesnap.com/docs/ipn-setup
 *       https://developers.bluesnap.com/reference/webhooks-ipns
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * BlueSnap `transactionType` → canonical resource + action. BlueSnap models
 * almost everything as a transaction event, so most types map onto `charges`
 * (or `refunds` / `disputes` for the dedicated lifecycle events).
 */
const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  CHARGE: { resourceType: 'charges', action: 'paid' },
  AUTH_ONLY: { resourceType: 'charges', action: 'created' },
  RECURRING: { resourceType: 'charges', action: 'paid' },
  CC_CHARGE_FAILED: { resourceType: 'charges', action: 'failed' },
  DECLINE: { resourceType: 'charges', action: 'failed' },
  FRAUD_DECLINE: { resourceType: 'charges', action: 'failed' },
  REFUND: { resourceType: 'refunds', action: 'refunded' },
  CANCELLATION_REFUND: { resourceType: 'refunds', action: 'refunded' },
  CANCELLATION: { resourceType: 'subscriptions', action: 'cancelled' },
  CANCEL_ON_RENEWAL: { resourceType: 'subscriptions', action: 'cancelled' },
  CHARGEBACK: { resourceType: 'disputes', action: 'disputed' },
  RDR: { resourceType: 'disputes', action: 'disputed' },
  SUBSCRIPTION_CHARGE_FAILURE: { resourceType: 'subscriptions', action: 'failed' },
  CONTRACT_CHANGE: { resourceType: 'subscriptions', action: 'updated' },
}

function normaliseType(transactionType: string): string {
  return transactionType.trim().toUpperCase().replace(/[\s-]+/g, '_')
}

function classify(transactionType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  return EVENT_MAP[normaliseType(transactionType)] ?? { resourceType: 'unknown', action: 'unknown' }
}

export function verifyBluesnapWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const sig = headers['bls-signature'] ?? headers['Bls-Signature']
    const timestamp = headers['bls-ipn-timestamp'] ?? headers['Bls-Ipn-Timestamp']
    if (!sig || timestamp === undefined) return false

    const message = Buffer.concat([Buffer.from(timestamp, 'utf8'), payload])
    const expected = createHmac('sha256', secret).update(message).digest('hex')

    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseBluesnapWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const transactionType = String(payload['transactionType'] ?? '')
  const resourceId = String(
    payload['referenceNumber'] ??
      payload['invoiceNumber'] ??
      payload['subscriptionId'] ??
      payload['transactionId'] ??
      '',
  )
  const { resourceType, action } = classify(transactionType)
  return [
    {
      platform: 'bluesnap',
      type: transactionType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const BluesnapWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyBluesnapWebhook,
  parseWebhookEvents: parseBluesnapWebhookEvents,
}
