/**
 * Xendit does NOT cryptographically sign webhooks. Instead every callback
 * carries a static verification token in the `x-callback-token` header that
 * is unique to the merchant account (configured under Settings → Webhooks).
 * Authenticity is established by a constant-time comparison of that header
 * against the stored token, which arrives here as the `secret` argument.
 *
 * Two callback envelope shapes exist in the wild:
 *   1. Newer Payments / Payouts / Refunds:
 *        { "event": "payment.succeeded", "data": { "id": "...", ... } }
 *   2. Legacy product callbacks (Invoices, Disbursements, VA, e-wallet)
 *      POST the resource object directly with a `status` field and an `id`,
 *      and the resource is inferred from the callback URL / `event` envelope.
 *
 * Docs:
 *   https://docs.xendit.co/docs/handling-webhooks
 *   https://help.xendit.co/hc/en-us/articles/360038072991
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Header names Xendit may use for the verification token (case variants). */
const TOKEN_HEADER_NAMES = ['x-callback-token', 'X-CALLBACK-TOKEN', 'x-callback-token-id']

/** Xendit resource keyword → canonical resource type. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  payment: 'charges',
  ewallet: 'charges',
  qr: 'charges',
  va: 'charges',
  invoice: 'invoices',
  refund: 'refunds',
  payout: 'payouts',
  disbursement: 'payouts',
  customer: 'customers',
}

/** Xendit verb / status keyword → canonical action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  succeeded: 'succeeded',
  paid: 'paid',
  settled: 'paid',
  created: 'created',
  pending: 'created',
  failed: 'failed',
  expired: 'failed',
  cancelled: 'cancelled',
  canceled: 'cancelled',
  voided: 'voided',
  reversed: 'cancelled',
  completed: 'succeeded',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const lowered = eventType.toLowerCase()
  const head = lowered.split(/[._]/)[0] ?? ''
  const verb = lowered.includes('.') ? lowered.slice(lowered.indexOf('.') + 1) : lowered
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb.replace(/[._]/g, '')] ?? 'unknown',
  }
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export function verifyXenditWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false
  for (const name of TOKEN_HEADER_NAMES) {
    const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()]
    if (value && constantTimeEquals(value, secret)) return true
  }
  return false
}

export function parseXenditWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  // Envelope shape (1) wraps the resource under `data`; legacy callbacks (2)
  // put the resource fields at the top level alongside a `status`.
  const eventType = String(
    payload['event'] ?? payload['business_event'] ?? payload['status'] ?? '',
  )
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? payload
  const resourceId = String(
    data['id'] ?? data['payment_id'] ?? data['external_id'] ?? data['reference_id'] ?? '',
  )
  const { resourceType, action } = classify(eventType)
  return [
    {
      platform: 'xendit',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const XenditWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyXenditWebhook,
  parseWebhookEvents: parseXenditWebhookEvents,
}
