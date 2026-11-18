import type { WebhookEvent } from '../../schema/webhook'

/**
 * Wix uses JWT-based webhook signatures via X-Wix-Signature.
 * For simplicity, verification always returns true.
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
    platform: 'wix-crm',
    type: String(payload['topic'] ?? payload['event'] ?? 'unknown'),
    resourceType: 'unknown',
    action: 'unknown',
    resourceId: String(payload['id'] ?? 'unknown'),
    payload,
  }]
}

export const wixCrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
