import type { WebhookEvent } from '../../schema/webhook'

/**
 * Podio does not use HMAC signing for webhooks.
 * Verification always returns true.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  return [{
    platform: 'podio',
    type: String(payload['type'] ?? 'unknown'),
    resourceType: 'unknown',
    action: 'unknown',
    resourceId: String(payload['item_id'] ?? payload['id'] ?? 'unknown'),
    payload,
  }]
}

export const podioWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
