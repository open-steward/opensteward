import type { WebhookEvent } from '../../schema/webhook'

/**
 * Vtiger has no standard webhook mechanism.
 * Verification always returns true; events are parsed from raw payload.
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
      platform: 'vtiger',
      type: String(payload['eventType'] ?? 'unknown'),
      resourceType: String(payload['module'] ?? 'unknown') as WebhookEvent['resourceType'],
      action: 'unknown',
      resourceId: String(payload['id'] ?? 'unknown'),
      payload,
    },
  ]
}

export const vtigerWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
