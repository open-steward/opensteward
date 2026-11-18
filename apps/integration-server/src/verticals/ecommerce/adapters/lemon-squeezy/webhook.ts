/**
 * Lemon Squeezy webhook verification and event parsing.
 *
 * Verification: Lemon Squeezy signs the raw request body with HMAC-SHA256
 * (hex-encoded) using the webhook signing secret, and puts the signature in
 * the `X-Signature` header. Compare using `timingSafeEqual`.
 *
 * Event parsing: the event name is sent in the `X-Event-Name` header
 * (e.g. `order_created`, `subscription_updated`).
 *
 * Docs: https://docs.lemonsqueezy.com/help/webhooks/signing-requests
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

export function verifyLemonSqueezyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig = headers['x-signature'] ?? headers['X-Signature']
    if (!headerSig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    const a = Buffer.from(headerSig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// ── Event name → canonical mapping ───────────────────────────────────────────
//
// Lemon Squeezy event names follow the pattern: <resource>_<verb>
// e.g. "order_created", "subscription_updated", "license_key_created"

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  order: 'orders',
  order_refunded: 'refunds',
  subscription: 'orders',      // closest canonical for subscription lifecycle
  subscription_payment: 'transactions',
  license_key: 'unknown',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  create: 'created',
  updated: 'updated',
  update: 'updated',
  cancelled: 'updated',
  expired: 'updated',
  refunded: 'created',
  resumed: 'updated',
  paused: 'updated',
  unpaused: 'updated',
}

function mapEventName(eventName: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const lower = eventName.toLowerCase()

  // Handle compound names like "order_refunded" before splitting
  if (lower === 'order_refunded') {
    return { resourceType: 'refunds', action: 'created' }
  }

  // Split on last underscore to separate resource from verb
  const lastUnderscore = lower.lastIndexOf('_')
  if (lastUnderscore === -1) {
    return { resourceType: 'unknown', action: 'unknown' }
  }
  const resource = lower.slice(0, lastUnderscore)
  const verb = lower.slice(lastUnderscore + 1)

  return {
    resourceType: RESOURCE_MAP[resource] ?? 'unknown',
    action: ACTION_MAP[verb] ?? 'unknown',
  }
}

/**
 * Parse a Lemon Squeezy webhook delivery into zero-or-one canonical events.
 *
 * Lemon Squeezy always delivers a single event per HTTP request, wrapped in a
 * JSON:API `data` envelope. The event name comes from the `X-Event-Name`
 * header (or the `__topic` / `meta.event_name` fallback in the body).
 */
export function parseLemonSqueezyWebhookEvents(
  payload: Record<string, unknown>,
  eventNameHeader?: string,
): WebhookEvent[] {
  const eventName =
    eventNameHeader ??
    (payload['__topic'] as string | undefined) ??
    ((payload['meta'] as Record<string, unknown> | undefined)?.['event_name'] as string | undefined) ??
    ''

  const { resourceType, action } = eventName
    ? mapEventName(eventName)
    : { resourceType: 'unknown' as const, action: 'unknown' as const }

  // JSON:API shape: payload.data.id contains the resource id
  const dataObj = payload['data'] as Record<string, unknown> | undefined
  const rawId = dataObj?.['id'] ?? payload['id']
  const resourceId = rawId == null ? '' : String(rawId)

  return [
    {
      platform: 'lemon-squeezy',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const lemonSqueezyWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyLemonSqueezyWebhook,
  parseWebhookEvents: parseLemonSqueezyWebhookEvents,
}
