import type { WebhookEvent } from '../../schema/webhook'

/**
 * Creatio does not provide standard HMAC webhook signatures.
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
    platform: 'creatio',
    type: String(payload['event'] ?? 'unknown'),
    resourceType: 'unknown',
    action: 'unknown',
    resourceId: String(payload['id'] ?? 'unknown'),
    payload,
  }]
}

export const creatioWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
