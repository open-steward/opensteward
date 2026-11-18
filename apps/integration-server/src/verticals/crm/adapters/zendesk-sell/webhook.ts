import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify a Zendesk Sell webhook payload.
 *
 * Zendesk Sell signs webhooks with HMAC-SHA1. The signature is provided in the
 * `X-Integrity-Hash` header (lower-cased by HTTP clients as
 * `x-integrity-hash`).
 */
export function verifyZendeskSellWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const signature = headers['x-integrity-hash'] ?? headers['X-Integrity-Hash'] ?? ''
  if (!signature) return false
  const hmac = crypto.createHmac('sha1', secret)
  hmac.update(payload)
  const digest = hmac.digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest))
  } catch {
    return false
  }
}

/**
 * Parse Zendesk Sell webhook payload into canonical WebhookEvent(s).
 *
 * The platform sends `meta.type` (e.g. `update`, `create`, `delete`) and
 * `meta.event_type` (e.g. `contact`, `deal`).
 */
export function parseZendeskSellWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const meta = (payload['meta'] ?? {}) as Record<string, unknown>
  const eventType = String(meta['event_type'] ?? 'unknown')
  const action = String(meta['type'] ?? 'unknown')
  const data = (payload['data'] ?? {}) as Record<string, unknown>
  const resourceId = String(data['id'] ?? 'unknown')

  return [{
    platform: 'zendesk-sell',
    type: `${eventType}.${action}`,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId,
    payload,
  }]
}

export const zendeskSellWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyZendeskSellWebhook,
  parseWebhookEvents: parseZendeskSellWebhookEvents,
}
