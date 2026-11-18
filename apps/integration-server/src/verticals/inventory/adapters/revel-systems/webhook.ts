/**
 * Revel Systems webhook verification + parsing.
 *
 * Signing:   HMAC-SHA1 over the raw body, hex-encoded.
 * Header:    X-Revel-Signature  (may arrive lower-cased from proxies)
 * Event type header: X-Revel-Event-Type
 * Establishment header: X-Revel-Establishment-Id
 *
 * Documented event types (from Revel webhook docs):
 *   inout.stock      — product/ingredient/modifier went in or out of stock
 *   menu.updated     — menu modifications (products added/edited)
 *   order.finalized  — not relevant to inventory but parsed generically
 *   customer.*       — skipped (not inventory domain)
 *   timesheet.*      — skipped
 *   ping             — health check
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

const SIG_HEADER_CANDIDATES = ['x-revel-signature', 'X-Revel-Signature']

/**
 * Verify that an incoming Revel webhook payload is authentic.
 * Revel signs the raw body bytes with HMAC-SHA1 and sends the hex digest
 * in the X-Revel-Signature header.
 */
export function verifyRevelWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const expected = createHmac('sha1', secret).update(payload).digest('hex')
    const a = Buffer.from(expected, 'utf8')
    for (const name of SIG_HEADER_CANDIDATES) {
      const provided = headers[name] ?? headers[name.toLowerCase()]
      if (!provided) continue
      const b = Buffer.from(provided.trim(), 'utf8')
      if (a.length !== b.length) continue
      if (timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}

type EventMap = Record<string, { resourceType: WebhookResourceType; action: WebhookAction }>

const EVENT_MAP: EventMap = {
  'inout.stock': { resourceType: 'stock-levels', action: 'updated' },
  'menu.updated': { resourceType: 'products', action: 'updated' },
}

/**
 * Parse a Revel webhook POST body into canonical WebhookEvent(s).
 *
 * Revel embeds the event type in the top-level `event_type` or `type` field
 * of the JSON body.  The X-Revel-Event-Type header is NOT available here
 * (WebhookHandler.parseWebhookEvents only receives the body); callers should
 * populate `payload.event_type` from the header before calling this.
 */
export function parseRevelWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(
    payload['event_type'] ??
    payload['type'] ??
    '',
  )

  const resourceId = String(
    payload['id'] ??
    payload['resource_id'] ??
    payload['ingredient_id'] ??
    payload['product_id'] ??
    '',
  )

  const mapped: { resourceType: WebhookResourceType; action: WebhookAction } =
    EVENT_MAP[eventType] ?? {
      resourceType: 'unknown' as WebhookResourceType,
      action: 'unknown' as WebhookAction,
    }

  return [
    {
      id: `revel-systems:${eventType}:${resourceId}`,
      platform: 'revel-systems',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      payload,
    },
  ]
}

export const RevelSystemsWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyRevelWebhook,
  parseWebhookEvents: parseRevelWebhookEvents,
}
