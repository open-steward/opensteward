import crypto from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify an Outreach webhook by comparing the `outreach-signature` header
 * (HMAC-SHA256 hex of the raw body) against the shared secret.
 */
export function verifyWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const sig = headers['outreach-signature'] ?? ''
  if (!sig) return false
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex')
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  } catch {
    return false
  }
}

/**
 * Parse Outreach webhook payload into canonical WebhookEvents.
 * Outreach sends `meta.eventName` as e.g. `prospect.created`.
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const meta = payload['meta'] as Record<string, unknown> | undefined
  const eventName = String(meta?.['eventName'] ?? 'unknown')
  const data = payload['data'] as Record<string, unknown> | undefined
  const resourceId = String(data?.['id'] ?? 'unknown')

  return [{
    platform: 'outreach',
    type: eventName,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId,
    payload,
  }]
}

export const outreachWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
