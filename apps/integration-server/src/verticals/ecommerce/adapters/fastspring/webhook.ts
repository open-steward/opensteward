/**
 * FastSpring webhook verification and event parsing.
 *
 * Verification: FastSpring signs the RAW request body with HMAC-SHA256 and
 * base64-encodes the digest into the `X-FS-Signature` header ("not
 * case-sensitive and might be sent with varying case"). Compare
 * timing-safely.
 *
 * Docs: https://developer.fastspring.com/reference/message-security
 *
 * Event parsing: unlike Shopify (one event per delivery), "each POST from
 * FastSpring to your endpoint may contain multiple events in a single
 * payload" — `{ events: [{ id, type, data, live, processed, created }] }`.
 * Docs: https://developer.fastspring.com/reference/webhooks-overview
 *
 * Only events about a canonical ecommerce resource we implement (accounts →
 * customers, orders, returns → refunds) map to a known resourceType;
 * everything else (subscriptions, quotes, payouts, mailing lists, invoices —
 * none of which are canonical ecommerce resources FastSpring supports here)
 * comes through as `unknown` rather than guessed.
 *
 * Exported names: only `verifyFastSpringWebhook`, `parseFastSpringWebhookEvents`
 * and `fastspringWebhook`. The generated `../../webhooks.ts` registers
 * `fastspringWebhook` (`pnpm run generate:webhook-aggregators`), so no
 * other export name should be added here: the generator could pick it up
 * instead.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

export function verifyFastSpringWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    // Header lookup is case-insensitive per the docs; callers may hand us
    // headers already lower-cased or not.
    const headerSig = findHeader(headers, 'x-fs-signature')
    if (!headerSig) return false

    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

function findHeader(headers: Record<string, string>, name: string): string | undefined {
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === name) return value
  }
  return undefined
}

// ── Event type → canonical mapping ──────────────────────────────────────────

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  account: 'customers',
  order: 'orders',
  return: 'refunds',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  completed: 'updated',
  failed: 'updated',
  canceled: 'updated',
}

function mapEventType(
  type: string,
): { resourceType: WebhookResourceType; action: WebhookAction; group?: string } {
  // FastSpring event types are dot-separated, e.g. "account.created",
  // "order.completed", "order.approval.pending", "return.created". Only the
  // first segment identifies the resource; the rest (which may itself
  // contain dots) identifies the sub-event.
  const [group = 'unknown', ...rest] = type.toLowerCase().split('.')
  const resourceType = RESOURCE_MAP[group] ?? 'unknown'
  if (resourceType === 'unknown') return { resourceType: 'unknown', action: 'unknown' }
  const verb = rest[0] ?? ''
  return { resourceType, action: ACTION_MAP[verb] ?? 'unknown', group }
}

/**
 * Resource id extraction, keyed EXACTLY by the FastSpring group the event
 * type identified (never a chain across unrelated resources' id fields):
 * account events carry `data.account`, order events `data.order`, return
 * events `data.return` — the same field name each resource's own GET
 * response uses for its id (see transform/customer.ts, transform/order.ts,
 * transform/refund.ts).
 */
function extractResourceId(data: Record<string, unknown> | undefined, group: string | undefined): string {
  if (!data || !group) return ''
  const id = data[group]
  return id == null ? '' : String(id)
}

interface RawFastSpringWebhookEvent {
  id?: string
  type?: string
  data?: Record<string, unknown>
}

/**
 * Parse a FastSpring webhook delivery into zero-or-more canonical events —
 * one call may legitimately carry many, per the docs (see file header).
 */
export function parseFastSpringWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const events = Array.isArray(payload['events']) ? (payload['events'] as RawFastSpringWebhookEvent[]) : []
  return events.map((event) => {
    const type = event.type ?? ''
    const { resourceType, action, group } = type
      ? mapEventType(type)
      : { resourceType: 'unknown' as const, action: 'unknown' as const, group: undefined }
    return {
      id: event.id,
      platform: 'fastspring',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId: extractResourceId(event.data, group),
      payload: (event.data ?? {}) as Record<string, unknown>,
    }
  })
}

export const fastspringWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyFastSpringWebhook,
  parseWebhookEvents: parseFastSpringWebhookEvents,
}
