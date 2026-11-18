import type { WebhookEvent } from '../../schema/webhook'

/**
 * Oracle CX Sales has no standard webhook mechanism.
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
      platform: 'oracle-cx',
      type: String(payload['eventType'] ?? 'unknown'),
      resourceType: String(payload['resourceType'] ?? 'unknown') as WebhookEvent['resourceType'],
      action: 'unknown',
      resourceId: String(payload['resourceId'] ?? 'unknown'),
      payload,
    },
  ]
}

export const oracleCxWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
