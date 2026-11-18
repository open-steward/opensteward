/**
 * Finix webhook signature verification + event parsing.
 *
 * Every delivery carries a `Finix-Signature` header of the form
 *   `timestamp=<epoch-seconds>, sig=<hex-hmac>`
 * Finix builds the string `${timestamp}:${rawBody}` (colon separator, body
 * used exactly as delivered) and computes HMAC-SHA256 over it using the
 * webhook's signing key (treated as a UTF-8 string), hex-encoded lowercase.
 * We also enforce a replay window on the timestamp.
 *
 * The event body looks like:
 *   { id, type: "created"|"updated", entity: "transfer"|"identity"|…,
 *     occurred_at, _embedded: { <entity_plural>: [ { resource } ] } }
 *
 * Docs:
 *   https://docs.finix.com/additional-resources/developers/webhooks/integrating-into-webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const REPLAY_TOLERANCE_MS = 5 * 60 * 1000

const ENTITY_MAP: Record<string, WebhookResourceType> = {
  transfer: 'charges',
  reversal: 'refunds',
  identity: 'customers',
  payment_instrument: 'payment_methods',
  dispute: 'disputes',
  settlement: 'payouts',
  authorization: 'charges',
}

const TYPE_MAP: Record<string, WebhookAction> = {
  created: 'created',
  updated: 'updated',
  succeeded: 'succeeded',
  failed: 'failed',
  canceled: 'cancelled',
  cancelled: 'cancelled',
}

function classify(entity: string, type: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  return {
    resourceType: ENTITY_MAP[entity.toLowerCase()] ?? 'unknown',
    action: TYPE_MAP[type.toLowerCase()] ?? 'unknown',
  }
}

/** Parse `timestamp=…, sig=…` into its parts (order-independent). */
function parseSignatureHeader(header: string): { timestamp?: string; sig?: string } {
  const out: { timestamp?: string; sig?: string } = {}
  for (const piece of header.split(',')) {
    const eq = piece.indexOf('=')
    if (eq < 0) continue
    const key = piece.slice(0, eq).trim()
    const value = piece.slice(eq + 1).trim()
    if (key === 'timestamp') out.timestamp = value
    else if (key === 'sig') out.sig = value
  }
  return out
}

export function verifyFinixWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
  now: () => number = Date.now,
): boolean {
  try {
    if (!secret) return false
    const header = headers['finix-signature'] ?? headers['Finix-Signature']
    if (!header) return false
    const { timestamp, sig } = parseSignatureHeader(header)
    if (!timestamp || !sig) return false

    const tsSec = Number(timestamp)
    if (!Number.isFinite(tsSec)) return false
    if (Math.abs(now() - tsSec * 1000) > REPLAY_TOLERANCE_MS) return false

    const signed = Buffer.concat([Buffer.from(`${timestamp}:`), payload])
    const expected = createHmac('sha256', secret).update(signed).digest('hex')
    const a = Buffer.from(sig.toLowerCase())
    const b = Buffer.from(expected.toLowerCase())
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseFinixWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const entity = String(payload['entity'] ?? '')
  const type = String(payload['type'] ?? '')
  const { resourceType, action } = classify(entity, type)

  const embedded = (payload['_embedded'] as Record<string, unknown> | undefined) ?? {}
  const resources = Object.values(embedded).find(Array.isArray) as
    | Array<Record<string, unknown>>
    | undefined
  const first = resources?.[0]
  const resourceId = String(first?.['id'] ?? payload['id'] ?? '')

  return [
    {
      id: payload['id'] ? String(payload['id']) : undefined,
      platform: 'finix',
      type: entity && type ? `${entity}.${type}` : type || entity,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const FinixWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyFinixWebhook,
  parseWebhookEvents: parseFinixWebhookEvents,
}
