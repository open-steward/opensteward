/**
 * Sezzle secures webhooks with an HMAC-SHA256 signature. The `Sezzle-Signature`
 * header carries a hash of the raw webhook body, keyed on the merchant's
 * **private key** (the same `sz_pr_…` used for API auth). Verify it to confirm
 * the delivery came from Sezzle.
 *
 * The webhook body Sezzle POSTs has the shape:
 *   { uuid, created_at, event, data_type, data }
 * where `event` is e.g. `order.authorized` / `order.captured` /
 * `order.refunded` / `customer.tokenized` / `dispute.*`, `data_type` is the
 * resource category (`order` / `customer` / `dispute`), and `data` is the
 * resource payload (its own `uuid` identifies the affected object).
 *
 * The docs state HMAC-SHA256 but don't pin the encoding, so we accept either
 * hex or base64 and compare in constant time.
 *
 * Docs: https://docs.sezzle.com/docs/api/core/webhooks/infov2webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  order: 'charges',
  customer: 'customers',
  dispute: 'disputes',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  authorized: 'created',
  captured: 'paid',
  refunded: 'refunded',
  tokenized: 'created',
  closed: 'updated',
  merchant_input_requested: 'updated',
  deadline_approaching: 'updated',
}

function classify(event: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const lowered = event.toLowerCase()
  const dot = lowered.indexOf('.')
  if (dot === -1) return { resourceType: 'unknown', action: 'unknown' }
  const head = lowered.slice(0, dot)
  // e.g. `dispute.closed.customer_win` → verb head is `closed`
  const tail = lowered.slice(dot + 1)
  const verb = tail.includes('.') ? tail.slice(0, tail.indexOf('.')) : tail
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

function safeEqualEncoded(sig: string, expectedHex: string): boolean {
  // The header may be hex or base64; try both encodings.
  for (const enc of ['hex', 'base64'] as const) {
    try {
      const a = Buffer.from(sig, enc)
      const b = Buffer.from(enc === 'hex' ? expectedHex : Buffer.from(expectedHex, 'hex').toString('base64'), enc)
      if (a.length > 0 && a.length === b.length && timingSafeEqual(a, b)) return true
    } catch {
      // try the next encoding
    }
  }
  return false
}

export function verifySezzleWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const sig = headers['sezzle-signature'] ?? headers['Sezzle-Signature']
    if (!sig) return false
    const expectedHex = createHmac('sha256', secret).update(payload).digest('hex')
    return safeEqualEncoded(sig.trim(), expectedHex)
  } catch {
    return false
  }
}

export function parseSezzleWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const event = String(payload['event'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['uuid'] ?? data['order_uuid'] ?? payload['uuid'] ?? '')
  const { resourceType, action } = classify(event)
  return [
    {
      platform: 'sezzle',
      type: event,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const SezzleWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySezzleWebhook,
  parseWebhookEvents: parseSezzleWebhookEvents,
}
