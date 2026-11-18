/**
 * Asaas does **not** sign webhooks with an HMAC or asymmetric signature.
 * Instead, the merchant configures a static `authToken` on the webhook (or
 * lets Asaas auto-generate one), and Asaas echoes it back in the
 * `asaas-access-token` header on every delivery. Verification is therefore a
 * constant-time equality check of that header against the configured secret —
 * the `secret` passed to `verifyWebhook` is the webhook's `authToken`.
 *
 * The payload is `{ id, event, dateCreated, payment | subscription | ... }`:
 * the resource object is nested under a key named after its type (`payment`
 * for the PAYMENT_* events, `subscription` for SUBSCRIPTION_* events, etc).
 *
 * Docs: https://docs.asaas.com/docs/about-webhooks
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Event-name prefix (head, before the first `_`) → canonical resource. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  PAYMENT: 'charges',
  SUBSCRIPTION: 'subscriptions',
  INVOICE: 'invoices',
  TRANSFER: 'payouts',
  CHARGEBACK: 'disputes',
}

/** Resource object key in the payload → canonical resource (fallback). */
const PAYLOAD_KEY_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  subscription: 'subscriptions',
  invoice: 'invoices',
  transfer: 'payouts',
  chargeback: 'disputes',
}

/** Event verb (everything after the resource prefix) → canonical action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  CREATED: 'created',
  UPDATED: 'updated',
  DELETED: 'deleted',
  RESTORED: 'updated',
  CONFIRMED: 'paid',
  RECEIVED: 'paid',
  RECEIVED_IN_CASH: 'paid',
  ANTICIPATED: 'updated',
  OVERDUE: 'failed',
  REFUNDED: 'refunded',
  REFUND_REQUESTED: 'refunded',
  REFUND_IN_PROGRESS: 'refunded',
  PARTIALLY_REFUNDED: 'refunded',
  CHARGEBACK_REQUESTED: 'disputed',
  CHARGEBACK_DISPUTE: 'disputed',
  AWAITING_CHARGEBACK_REVERSAL: 'disputed',
  DUNNING_REQUESTED: 'updated',
  DUNNING_RECEIVED: 'paid',
}

/**
 * Asaas event names are UPPER_SNAKE with a leading resource word:
 * `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED`, `SUBSCRIPTION_CREATED`,
 * `PAYMENT_CHARGEBACK_REQUESTED`. The first underscore-delimited token is the
 * resource; the rest (re-joined with `_`) is the verb.
 */
function classify(eventType: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const upper = eventType.toUpperCase()
  const us = upper.indexOf('_')
  if (us === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = upper.slice(0, us)
  const verb = upper.slice(us + 1)
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function verifyAsaasWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const token =
      headers['asaas-access-token'] ??
      headers['Asaas-Access-Token'] ??
      headers['ASAAS-ACCESS-TOKEN']
    if (!token) return false
    return constantTimeEqual(token, secret)
  } catch {
    return false
  }
}

export function parseAsaasWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event'] ?? '')
  const { resourceType, action } = classify(eventType)

  // Locate the nested resource object: prefer the key matching the resource,
  // else fall back to whichever known resource key is present.
  let resource: Record<string, unknown> | undefined
  for (const key of Object.keys(PAYLOAD_KEY_MAP)) {
    const candidate = payload[key]
    if (candidate && typeof candidate === 'object') {
      resource = candidate as Record<string, unknown>
      break
    }
  }
  const resourceId = String(resource?.['id'] ?? '')

  return [
    {
      id: payload['id'] != null ? String(payload['id']) : undefined,
      platform: 'asaas',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const AsaasWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAsaasWebhook,
  parseWebhookEvents: parseAsaasWebhookEvents,
}
