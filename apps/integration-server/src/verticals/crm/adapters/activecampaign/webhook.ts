import type { WebhookEvent } from '../../schema/webhook'

/**
 * ActiveCampaign does not use HMAC signing for webhooks.
 * Always returns true — callers should rely on network-layer allowlists.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  return [
    {
      platform: 'activecampaign',
      type: String(payload['type'] ?? 'unknown'),
      resourceType: 'unknown',
      action: 'unknown',
      resourceId: String(payload['object_id'] ?? payload['id'] ?? 'unknown'),
      payload,
    },
  ]
}

export const activecampaignWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
