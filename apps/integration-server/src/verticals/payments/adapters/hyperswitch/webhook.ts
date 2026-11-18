/**
 * Hyperswitch signs outgoing webhooks with an HMAC of the raw JSON body using
 * the merchant's `payment_response_hash_key`. The hex-encoded digest ships in
 * `x-webhook-signature-512` (HMAC-SHA512, recommended) or, as a fallback,
 * `x-webhook-signature-256` (HMAC-SHA256). We verify whichever header is
 * present, preferring SHA-512.
 *
 * The event envelope carries a `event_type` (e.g. `payment_succeeded`,
 * `refund_failed`, `dispute_opened`) and a `content` wrapper whose `object`
 * holds the resource (a PaymentsResponse / RefundResponse / dispute, etc).
 *
 * Docs: https://docs.hyperswitch.io/integration-guide/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/**
 * Map a Hyperswitch `event_type` to a canonical resource + action. Event types
 * are flat `<resource>_<verb>` strings (e.g. `payment_succeeded`).
 */
const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  payment_succeeded: { resourceType: 'charges', action: 'succeeded' },
  payment_failed: { resourceType: 'charges', action: 'failed' },
  payment_processing: { resourceType: 'charges', action: 'updated' },
  payment_cancelled: { resourceType: 'charges', action: 'cancelled' },
  payment_authorized: { resourceType: 'charges', action: 'updated' },
  payment_captured: { resourceType: 'charges', action: 'paid' },
  action_required: { resourceType: 'charges', action: 'updated' },
  refund_succeeded: { resourceType: 'refunds', action: 'succeeded' },
  refund_failed: { resourceType: 'refunds', action: 'failed' },
  dispute_opened: { resourceType: 'disputes', action: 'disputed' },
  dispute_expired: { resourceType: 'disputes', action: 'updated' },
  dispute_accepted: { resourceType: 'disputes', action: 'updated' },
  dispute_cancelled: { resourceType: 'disputes', action: 'cancelled' },
  dispute_challenged: { resourceType: 'disputes', action: 'updated' },
  dispute_won: { resourceType: 'disputes', action: 'updated' },
  dispute_lost: { resourceType: 'disputes', action: 'updated' },
  mandate_active: { resourceType: 'mandates', action: 'created' },
  mandate_revoked: { resourceType: 'mandates', action: 'cancelled' },
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  return EVENT_MAP[eventType.toLowerCase()] ?? { resourceType: 'unknown', action: 'unknown' }
}

/** Hex-encoded HMAC compare, constant-time. Returns false on any mismatch. */
function matches(algorithm: 'sha512' | 'sha256', payload: Buffer, secret: string, sig: string): boolean {
  try {
    const expected = createHmac(algorithm, secret).update(payload).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || a.length === 0) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function verifyHyperswitchWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false
  const sig512 = headers['x-webhook-signature-512'] ?? headers['X-Webhook-Signature-512']
  if (sig512) return matches('sha512', payload, secret, sig512)
  const sig256 = headers['x-webhook-signature-256'] ?? headers['X-Webhook-Signature-256']
  if (sig256) return matches('sha256', payload, secret, sig256)
  return false
}

/** Pull the resource payload out of the `content` wrapper (or the root). */
function extractObject(payload: Record<string, unknown>): Record<string, unknown> {
  const content = payload['content'] as Record<string, unknown> | undefined
  const inner = content?.['object'] as Record<string, unknown> | undefined
  return inner ?? content ?? payload
}

export function parseHyperswitchWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? '')
  const obj = extractObject(payload)
  const resourceId = String(
    obj['payment_id'] ??
      obj['refund_id'] ??
      obj['dispute_id'] ??
      obj['mandate_id'] ??
      obj['id'] ??
      payload['object_id'] ??
      '',
  )
  const { resourceType, action } = classify(eventType)
  return [
    {
      id: payload['event_id'] ? String(payload['event_id']) : undefined,
      platform: 'hyperswitch',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const HyperswitchWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyHyperswitchWebhook,
  parseWebhookEvents: parseHyperswitchWebhookEvents,
}
