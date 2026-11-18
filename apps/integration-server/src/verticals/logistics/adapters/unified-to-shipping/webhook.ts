/**
 * Unified.to webhook signature verification and event parsing.
 *
 * Unified.to signs webhook deliveries using HMAC-SHA256.
 * Unlike most platforms, the signature lives in the JSON body rather than a
 * custom HTTP header:
 *
 *   payload.sig256  — base64-encoded HMAC-SHA256
 *   payload.nonce   — random string included in the signed message
 *   payload.data    — array of changed objects (order-sensitive)
 *
 * Signed message = JSON.stringify(payload.data) + payload.nonce
 * Key            = workspace secret (from app.unified.to/settings/api)
 *
 * Reference: https://docs.unified.to/reference/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Unified.to webhook payload.
 *
 * The `secret` parameter is the Unified.to workspace secret.
 * The `headers` parameter is accepted to satisfy the WebhookHandler interface
 * but is not used — the signature resides in the body itself.
 */
export function verifyWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false
  try {
    const body = JSON.parse(payload.toString('utf8')) as Record<string, unknown>
    const sig256 = body['sig256']
    const nonce = body['nonce']
    const data = body['data']

    if (typeof sig256 !== 'string' || typeof nonce !== 'string' || !Array.isArray(data)) {
      return false
    }

    // Signed message: compact JSON of the data array concatenated with the nonce.
    const message = JSON.stringify(data) + nonce

    const computed = createHmac('sha256', secret).update(message).digest('base64')

    const a = Buffer.from(computed, 'utf8')
    const b = Buffer.from(sig256, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

type CanonicalResourceType = WebhookEvent['resourceType']
type CanonicalAction = WebhookEvent['action']

/** Map Unified.to object_type strings to canonical logistics resource types. */
const RESOURCE_TYPE_MAP: Record<string, CanonicalResourceType> = {
  'shipping#shipment': 'shipment',
  'shipping#tracking': 'tracking_event',
  'shipping#label': 'label',
  'shipping#rate': 'rate',
  'shipping#carrier': 'carrier',
  // Shorter forms that may appear
  shipment: 'shipment',
  tracking: 'tracking_event',
  label: 'label',
  rate: 'rate',
  carrier: 'carrier',
}

/** Map Unified.to event type strings to canonical actions. */
function resolveAction(type: string): CanonicalAction {
  const lower = type.toLowerCase()
  if (lower.includes('creat') || lower.includes('add')) return 'created'
  if (lower.includes('delet') || lower.includes('remov')) return 'deleted'
  if (lower.includes('cancel')) return 'cancelled'
  return 'updated'
}

/**
 * Parse a Unified.to webhook payload into canonical WebhookEvents.
 *
 * Unified.to delivers a batch of changed objects in `payload.data`.
 * Each element describes one changed resource.  The `webhook.event` field
 * carries the event classification (e.g. "created", "updated").
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const data = Array.isArray(payload['data']) ? (payload['data'] as Record<string, unknown>[]) : []
  const webhookMeta = (payload['webhook'] as Record<string, unknown> | undefined) ?? {}
  const eventType = String(webhookMeta['event'] ?? payload['type'] ?? 'updated')

  return data.flatMap((item): WebhookEvent[] => {
    const objectType = String(item['object_type'] ?? item['type'] ?? '')
    const resourceType: CanonicalResourceType = RESOURCE_TYPE_MAP[objectType] ?? 'shipment'
    const action: CanonicalAction = resolveAction(eventType)
    const resourceId = item['id'] != null ? String(item['id']) : undefined

    return [
      {
        platform: 'unified-to-shipping',
        type: eventType,
        resourceType,
        action,
        resourceId,
        payload: item,
      },
    ]
  })
}

export const unifiedToShippingWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
