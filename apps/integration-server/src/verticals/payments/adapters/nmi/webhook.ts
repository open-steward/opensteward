/**
 * NMI webhooks (Real-Time Event Notifications) sign each delivery with the
 * endpoint's signing key. The `Webhook-Signature` header carries a nonce and
 * an HMAC-SHA-256 over `{nonce}.{rawBody}`, formatted as:
 *
 *   Webhook-Signature: t=<nonce>,s=<hex_hmac_sha256>
 *
 * The signing key is generated on the Webhooks settings page of the Merchant
 * Portal and supplied to us as the webhook secret.
 *
 * The JSON payload is `{ event_id, event_type, event_body }` where
 * `event_type` is dot-notation, e.g. `transaction.sale.success`.
 *
 * Docs: https://docs.nmi.com/reference/overview
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
  chargeback: 'disputes',
  recurring: 'subscriptions',
  invoice: 'invoices',
  customer: 'customers',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  sale: 'paid',
  auth: 'created',
  capture: 'paid',
  void: 'voided',
  refund: 'refunded',
  credit: 'refunded',
  created: 'created',
  updated: 'updated',
  deleted: 'deleted',
  success: 'succeeded',
  failure: 'failed',
  unknown: 'unknown',
}

/**
 * Classify an NMI event_type. Format is dot-notation, e.g.
 * `transaction.sale.success` / `transaction.refund.success` /
 * `transaction.void.success`. The head segment selects the resource; the
 * remaining segments select the action (the action verb is preferred over the
 * trailing success/failure status when both are present).
 */
function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const parts = eventType.toLowerCase().split('.').filter(Boolean)
  if (parts.length === 0) return { resourceType: 'unknown', action: 'unknown' }
  const head = parts[0] ?? ''
  const resourceType = RESOURCE_MAP[head] ?? 'unknown'
  // Walk segments after the head; first one that maps wins (sale/refund/void
  // before the trailing success/failure).
  let action: WebhookAction = 'unknown'
  for (const seg of parts.slice(1)) {
    const mapped = ACTION_MAP[seg]
    if (mapped) {
      action = mapped
      break
    }
  }
  return { resourceType, action }
}

export function verifyNmiWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const header = headers['webhook-signature'] ?? headers['Webhook-Signature']
    if (!header) return false
    const nonce = /t=([^,]+)/.exec(header)?.[1]?.trim()
    const sig = /s=([^,]+)/.exec(header)?.[1]?.trim()
    if (!nonce || !sig) return false
    const message = `${nonce}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', secret).update(message, 'utf8').digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseNmiWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? '')
  const eventId = String(payload['event_id'] ?? '')
  const body = (payload['event_body'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(body['transaction_id'] ?? body['id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: eventId || undefined,
      platform: 'nmi',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const NmiWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyNmiWebhook,
  parseWebhookEvents: parseNmiWebhookEvents,
}
