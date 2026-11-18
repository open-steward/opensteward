import type { WebhookEvent } from '../../schema/webhook'

/**
 * AgileCRM does not provide webhook signing.
 * Always returns true — rely on network-level security (IP allowlisting etc.).
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
    platform: 'agilecrm',
    type: String(payload['event_type'] ?? 'unknown'),
    resourceType: String(payload['entity_type'] ?? 'unknown') as WebhookEvent['resourceType'],
    action: 'unknown',
    resourceId: String(payload['id'] ?? 'unknown'),
    payload,
  }]
}

export const agilecrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
