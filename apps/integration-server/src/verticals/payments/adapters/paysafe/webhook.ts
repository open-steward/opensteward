/**
 * Paysafe webhooks.
 *
 * Paysafe signs each notification with HMAC-SHA256 over the raw UTF-8 JSON
 * body using a shared secret (`hmacKey`), base64-encoded and delivered in the
 * `Signature` header:
 *
 *   digest    = HMAC_SHA256(hmacKey, <raw JSON body>)
 *   signature = base64(digest)
 *
 * Docs: https://developer.paysafe.com/en/api-docs/payments-api/configure-webhooks/
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Map a Paysafe event topic head → canonical resource type. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  payments: 'charges',
  paymenthandle: 'charges',
  settlement: 'charges',
  settlements: 'charges',
  refund: 'refunds',
  refunds: 'refunds',
  standalonecredit: 'refunds',
  profile: 'customers',
  customer: 'customers',
  payout: 'payouts',
  payouts: 'payouts',
  dispute: 'disputes',
  chargeback: 'disputes',
}

/** Map a Paysafe event verb / status → canonical action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  completed: 'succeeded',
  success: 'succeeded',
  succeeded: 'succeeded',
  failed: 'failed',
  declined: 'failed',
  error: 'failed',
  created: 'created',
  received: 'created',
  pending: 'created',
  cancelled: 'cancelled',
  voided: 'voided',
  expired: 'cancelled',
  refunded: 'refunded',
  updated: 'updated',
  held: 'disputed',
  disputed: 'disputed',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const lowered = eventType.toLowerCase()
  // Topics arrive as e.g. "PAYMENT_COMPLETED" or "payment.completed".
  const parts = lowered.split(/[._-]/).filter(Boolean)
  if (parts.length === 0) return { resourceType: 'unknown', action: 'unknown' }
  const head = parts[0]
  const verb = parts[parts.length - 1]
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

export function verifyPaysafeWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const sig = headers['signature'] ?? headers['Signature'] ?? headers['x-signature']
    if (!sig) return false
    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parsePaysafeWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(
    payload['eventType'] ?? payload['topic'] ?? payload['type'] ?? payload['eventName'] ?? '',
  )
  const resource = (payload['payload'] ?? payload['resource'] ?? payload['data']) as
    | Record<string, unknown>
    | undefined
  // The resource id lives in the nested payload; the top-level `id` is the
  // event id (surfaced separately as `event.id`). Prefer the resource id.
  const resourceId = String(
    payload['resourceId'] ??
      resource?.['id'] ??
      resource?.['merchantRefNum'] ??
      payload['id'] ??
      '',
  )
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: payload['id'] ? String(payload['id']) : undefined,
      platform: 'paysafe',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PaysafeWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPaysafeWebhook,
  parseWebhookEvents: parsePaysafeWebhookEvents,
}
