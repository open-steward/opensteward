/**
 * Helcim webhooks follow the Standard Webhooks signature scheme.
 *
 * Each delivery carries three headers:
 *   - `webhook-id`        — unique id for this delivery
 *   - `webhook-timestamp` — Unix timestamp (seconds)
 *   - `webhook-signature` — space-separated list of `v1,<base64>` signatures
 *
 * The signed content is `{webhook-id}.{webhook-timestamp}.{raw-body}`. The
 * signature is HMAC-SHA256 over that string, base64-encoded, keyed with the
 * merchant's **Verifier Token** — which Helcim issues base64-encoded, so it
 * must be base64-decoded before use as the HMAC key.
 *
 * The body is a small JSON envelope: `{ id, type }`, where `id` is the
 * resource id (e.g. a card-transaction id) and `type` is the event name
 * (e.g. `cardTransaction`).
 *
 * Docs: https://devdocs.helcim.com/docs/connected-account-webhooks
 *       https://www.standardwebhooks.com
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

/** Map Helcim `type` values onto canonical resource types. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  cardtransaction: 'charges',
  transaction: 'charges',
  customer: 'customers',
  invoice: 'invoices',
}

function classify(eventType: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const head = eventType.toLowerCase().replace(/[._-]/g, '')
  return {
    resourceType: RESOURCE_MAP[head] ?? 'unknown',
    // Helcim webhook deliveries announce that a resource exists/changed but do
    // not encode a verb in the `type`; classify as a generic update.
    action: RESOURCE_MAP[head] ? 'updated' : 'unknown',
  }
}

function safeEqualBase64(a: string, b: string): boolean {
  try {
    const ab = Buffer.from(a, 'base64')
    const bb = Buffer.from(b, 'base64')
    if (ab.length === 0 || ab.length !== bb.length) return false
    return timingSafeEqual(ab, bb)
  } catch {
    return false
  }
}

export function verifyHelcimWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const id = headers['webhook-id'] ?? headers['Webhook-Id']
    const timestamp = headers['webhook-timestamp'] ?? headers['Webhook-Timestamp']
    const sigHeader = headers['webhook-signature'] ?? headers['Webhook-Signature']
    if (!id || !timestamp || !sigHeader) return false

    // The Verifier Token is delivered base64-encoded; decode to the raw key.
    const key = Buffer.from(secret, 'base64')
    if (key.length === 0) return false

    const signedContent = `${id}.${timestamp}.${payload.toString('utf8')}`
    const expected = createHmac('sha256', key).update(signedContent).digest('base64')

    // The header may carry several space-separated `v1,<sig>` versions; accept
    // if any one matches.
    return sigHeader.split(' ').some((part) => {
      const idx = part.indexOf(',')
      const provided = idx === -1 ? part : part.slice(idx + 1)
      return safeEqualBase64(provided, expected)
    })
  } catch {
    return false
  }
}

export function parseHelcimWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['type'] ?? '')
  const resourceId = String(payload['id'] ?? '')
  const { resourceType, action } = classify(eventType)
  return [
    {
      platform: 'helcim',
      type: eventType,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const HelcimWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyHelcimWebhook,
  parseWebhookEvents: parseHelcimWebhookEvents,
}
