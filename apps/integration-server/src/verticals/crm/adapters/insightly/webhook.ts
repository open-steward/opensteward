import type { WebhookEvent } from '../../schema/webhook'

/**
 * Insightly webhook signing is an enterprise-only feature.
 * Always returns true — rely on network-level security.
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
    platform: 'insightly',
    type: String(payload['event_type'] ?? 'unknown'),
    resourceType: String(payload['object_type'] ?? 'unknown') as WebhookEvent['resourceType'],
    action: 'unknown',
    resourceId: String(payload['object_id'] ?? 'unknown'),
    payload,
  }]
}

export const insightlyWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
