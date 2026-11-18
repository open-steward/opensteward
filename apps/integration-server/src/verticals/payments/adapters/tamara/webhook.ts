/**
 * Tamara webhook verification + event parsing.
 *
 * Tamara authenticates each webhook delivery with a compact JWT signed using
 * the HS256 (HMAC-SHA-256) algorithm and the merchant's **Notification Token**
 * as the shared secret. The token is delivered both as a `tamaraToken` query
 * parameter and in the `Authorization: Bearer <tamaraToken>` header. Verifying
 * the JWT signature with the Notification Token proves the delivery originated
 * from Tamara and was not tampered with in transit.
 *
 * We verify the signature synchronously with `node:crypto` (constant-time
 * compare over the `<header>.<payload>` signing input) rather than reaching for
 * an async JWT library, so `verifyWebhook` stays synchronous per the adapter
 * interface.
 *
 * The notification body itself carries `order_id`, `order_reference_id`,
 * `event_type` (order_approved / order_declined / order_authorised /
 * order_canceled / order_captured / order_refunded / order_expired), and a
 * `data` object with event-specific ids (capture_id, refund_id, amounts).
 *
 * Docs: https://docs.tamara.co/reference/getting-started-with-webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

const BEARER_PREFIX = /^bearer\s+/i

function headerValue(headers: Record<string, string>, name: string): string | undefined {
  const direct = headers[name]
  if (direct) return direct
  const lowered = name.toLowerCase()
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lowered) return v
  }
  return undefined
}

/**
 * Extract the Tamara JWT from the request. Tamara puts the token in the
 * `Authorization: Bearer <token>` header and (redundantly) in a `tamaraToken`
 * header/query value — we accept either.
 */
function extractToken(headers: Record<string, string>): string | undefined {
  const auth = headerValue(headers, 'authorization')
  if (auth && BEARER_PREFIX.test(auth)) return auth.replace(BEARER_PREFIX, '').trim()
  const tamaraToken = headerValue(headers, 'tamaratoken') ?? headerValue(headers, 'tamaraToken')
  if (tamaraToken) return tamaraToken.trim()
  return undefined
}

/**
 * Verify the HS256 signature of a compact JWT against the shared secret.
 * Returns false for malformed tokens, non-HS256 tokens, or signature
 * mismatches.
 */
export function verifyTamaraWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const token = extractToken(headers)
    if (!token) return false
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [header, body, signature] = parts

    // Reject anything that isn't HS256 to avoid alg-confusion downgrades.
    try {
      const decodedHeader = JSON.parse(
        Buffer.from(header, 'base64url').toString('utf8'),
      ) as { alg?: string }
      if ((decodedHeader.alg ?? '').toUpperCase() !== 'HS256') return false
    } catch {
      return false
    }

    const expected = createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
    const a = Buffer.from(signature, 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Every Tamara webhook is an order lifecycle event, so each maps to the
 * `charges` canonical resource — except `order_refunded`, which we surface as
 * a `refunds` event. The action is derived from the `event_type`.
 */
const EVENT_MAP: Record<
  string,
  { resourceType: WebhookResourceType; action: WebhookAction }
> = {
  order_approved: { resourceType: 'charges', action: 'created' },
  order_authorised: { resourceType: 'charges', action: 'created' },
  order_authorized: { resourceType: 'charges', action: 'created' },
  order_declined: { resourceType: 'charges', action: 'failed' },
  order_captured: { resourceType: 'charges', action: 'paid' },
  order_canceled: { resourceType: 'charges', action: 'cancelled' },
  order_cancelled: { resourceType: 'charges', action: 'cancelled' },
  order_expired: { resourceType: 'charges', action: 'cancelled' },
  order_refunded: { resourceType: 'refunds', action: 'refunded' },
}

export function parseTamaraWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? payload['eventType'] ?? '')
  const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
  const mapped = EVENT_MAP[eventType.toLowerCase()] ?? {
    resourceType: 'unknown' as WebhookResourceType,
    action: 'unknown' as WebhookAction,
  }
  const resourceId = String(
    payload['order_id'] ??
      data['order_id'] ??
      payload['order_reference_id'] ??
      data['refund_id'] ??
      data['capture_id'] ??
      '',
  )
  return [
    {
      platform: 'tamara',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId,
      payload,
    },
  ]
}

export const TamaraWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyTamaraWebhook,
  parseWebhookEvents: parseTamaraWebhookEvents,
}
