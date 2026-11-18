/**
 * Network International (N-Genius Online) webhook handling.
 *
 * N-Genius does NOT sign webhook payloads (no HMAC, no signature header).
 * The documented authenticity mechanism is an optional **shared-secret
 * header** configured in the merchant portal: you register a header name +
 * value, and N-Genius sends it on every delivery. We validate that the
 * configured value is present.
 *
 * The configured secret is supplied to `verifyNetworkInternationalWebhook`
 * as the `secret` argument (the connection's webhook secret). It is matched
 * against any of the conventional header names N-Genius merchants register;
 * verification is a constant-time value comparison, not a cryptographic
 * signature check.
 *
 * Webhook payload shape (from the portal "Webhooks" docs):
 *   { eventId, eventName: "PURCHASED"|"CAPTURED"|"REFUNDED"|..., outletId,
 *     order: { reference, action, state, amount, _embedded: { payment: [...] } } }
 *
 * Docs: https://docs.ngenius-payments.com/reference/consuming-web-hooks
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Header names a merchant might register for the shared-secret token. */
const SECRET_HEADER_NAMES = [
  'x-webhook-token',
  'x-ni-webhook-token',
  'x-webhook-secret',
  'webhook-token',
]

/** N-Genius `eventName` → canonical resource + action. */
const EVENT_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  authorised: { resourceType: 'charges', action: 'created' },
  authorized: { resourceType: 'charges', action: 'created' },
  captured: { resourceType: 'charges', action: 'paid' },
  purchased: { resourceType: 'charges', action: 'paid' },
  partially_captured: { resourceType: 'charges', action: 'paid' },
  failed: { resourceType: 'charges', action: 'failed' },
  declined: { resourceType: 'charges', action: 'failed' },
  reversed: { resourceType: 'charges', action: 'voided' },
  voided: { resourceType: 'charges', action: 'voided' },
  refunded: { resourceType: 'refunds', action: 'refunded' },
  partially_refunded: { resourceType: 'refunds', action: 'refunded' },
}

function classify(eventName: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const key = eventName.toLowerCase().replace(/[\s-]+/g, '_')
  return EVENT_MAP[key] ?? { resourceType: 'unknown', action: 'unknown' }
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * N-Genius does not sign payloads. We treat a delivery as authentic when the
 * configured shared-secret value is present in one of the registered header
 * names. With no secret configured we cannot vouch for authenticity, so we
 * return `false` (fail closed).
 */
export function verifyNetworkInternationalWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  if (!secret) return false
  for (const name of SECRET_HEADER_NAMES) {
    const value = headers[name] ?? headers[name.toUpperCase()]
    if (value && constantTimeEquals(value, secret)) return true
  }
  return false
}

export function parseNetworkInternationalWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const eventName = String(payload['eventName'] ?? payload['eventType'] ?? '')
  const order = (payload['order'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(order['reference'] ?? order['_id'] ?? payload['eventId'] ?? '')
  const { resourceType, action } = classify(eventName)
  return [
    {
      platform: 'network-international',
      type: eventName,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const NetworkInternationalWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyNetworkInternationalWebhook,
  parseWebhookEvents: parseNetworkInternationalWebhookEvents,
}
