/**
 * Payhip webhook verification and event parsing.
 *
 * Verification: Payhip embeds a `signature` field directly in the JSON payload.
 * The expected value is `sha256(apiKey)` (hex-encoded). Verify using
 * `timingSafeEqual` to avoid timing attacks.
 *
 * Event types:
 *  - "paid"                  → orders.created
 *  - "refunded"              → refunds.created
 *  - "subscription.created"  → orders.created  (subscription purchase)
 *  - "subscription.deleted"  → orders.updated  (subscription cancelled)
 *
 * Docs: https://help.payhip.com/article/115-webhooks
 */

import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

/**
 * Verify a Payhip webhook payload.
 *
 * Payhip places the signature inside the JSON body as `payload.signature`.
 * The `secret` argument is the caller's Payhip API key.
 * The `payload` argument is the already-parsed JSON body (Buffer is unused but
 * accepted to satisfy the common `verifyWebhook(buffer, headers, secret)`
 * adapter interface — Payhip does not use headers for signing).
 */
export function verifyPayhipWebhook(
  _rawBody: Buffer,
  _headers: Record<string, string>,
  secret: string,
  parsedPayload?: Record<string, unknown>,
): boolean {
  try {
    const sig = parsedPayload?.['signature'] as string | undefined
    if (!sig) return false
    const expected = createHash('sha256').update(secret).digest('hex')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event type → canonical mapping ───────────────────────────────────────────

interface Mapped {
  resourceType: WebhookResourceType
  action: WebhookAction
}

const EVENT_MAP: Record<string, Mapped> = {
  paid: { resourceType: 'orders', action: 'created' },
  refunded: { resourceType: 'refunds', action: 'created' },
  'subscription.created': { resourceType: 'orders', action: 'created' },
  'subscription.deleted': { resourceType: 'orders', action: 'updated' },
}

function extractResourceId(payload: Record<string, unknown>, eventType: string): string {
  // "paid" / "refunded" → items[0].link or transaction at top level
  // Use the most specific available id.
  if (eventType === 'refunded') {
    const rawId =
      payload['transaction_id'] ??
      payload['id'] ??
      (payload['items'] as Array<{ link?: unknown }> | undefined)?.[0]?.link
    return rawId != null ? String(rawId) : ''
  }
  if (eventType === 'subscription.created' || eventType === 'subscription.deleted') {
    const rawId = payload['subscription_id'] ?? payload['customer_id'] ?? payload['id']
    return rawId != null ? String(rawId) : ''
  }
  // "paid" default
  const rawId =
    payload['transaction_id'] ??
    payload['id'] ??
    (payload['items'] as Array<{ link?: unknown }> | undefined)?.[0]?.link
  return rawId != null ? String(rawId) : ''
}

/**
 * Parse a Payhip webhook delivery into a single canonical WebhookEvent.
 *
 * Payhip delivers one event per HTTP POST. The `event_type` (or legacy
 * `type`) field in the payload identifies the event.
 */
export function parsePayhipWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType =
    ((payload['event_type'] ?? payload['type']) as string | undefined)?.toLowerCase() ?? ''

  const mapped = EVENT_MAP[eventType] ?? {
    resourceType: 'unknown' as const,
    action: 'unknown' as const,
  }

  const resourceId = extractResourceId(payload, eventType)

  return [
    {
      platform: 'payhip',
      type: `${mapped.resourceType}.${mapped.action}`,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      payload,
    },
  ]
}

export const payhipWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyPayhipWebhook,
  parseWebhookEvents: parsePayhipWebhookEvents,
}
