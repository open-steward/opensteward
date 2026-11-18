/**
 * Tabby does NOT HMAC-sign webhook bodies. At registration the merchant
 * supplies a custom signing header — an arbitrary `{ title, value }` pair —
 * and Tabby echoes that exact header on every delivery. Verification is
 * therefore a constant-time comparison of the configured shared secret against
 * the header value Tabby sent back (the framework hands us that secret).
 *
 * Because the header *name* is merchant-chosen and not pinned by Tabby, we
 * accept the secret appearing under any header value rather than hard-coding a
 * single header name. The body Tabby POSTs is the payment object itself —
 * `{ id, status, amount, currency, captures, refunds, … }` — with no separate
 * dotted event-type field, so we classify off the payment `status`.
 *
 * Docs:
 *   https://docs.tabby.ai/api-reference/webhooks/register-a-webhook
 *   https://docs.tabby.ai/api-reference/payments/retrieve-a-payment
 */
import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent } from '../../schema/webhook'

/** Map a Tabby payment status to a canonical webhook action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  new: 'created',
  authorized: 'created',
  captured: 'paid',
  closed: 'paid',
  refunded: 'refunded',
  rejected: 'failed',
  expired: 'failed',
  cancelled: 'cancelled',
}

function constantTimeEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a, 'utf8')
  const bb = Buffer.from(b, 'utf8')
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Confirm the delivery carries the merchant's configured signing-header value.
 * The header name is merchant-defined, so we scan every header value for an
 * exact, constant-time match against the stored secret.
 */
export function verifyTabbyWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    for (const value of Object.values(headers ?? {})) {
      if (typeof value === 'string' && constantTimeEquals(value.trim(), secret)) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

export function parseTabbyWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const status = String(payload['status'] ?? '').toLowerCase()
  const resourceId = String(payload['id'] ?? '')
  return [
    {
      platform: 'tabby',
      type: status ? `payment.${status}` : 'payment',
      resourceType: 'charges',
      action: ACTION_MAP[status] ?? 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const TabbyWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyTabbyWebhook,
  parseWebhookEvents: parseTabbyWebhookEvents,
}
