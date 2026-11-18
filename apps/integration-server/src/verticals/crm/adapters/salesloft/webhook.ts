import type { WebhookEvent } from '../../schema/webhook'

/**
 * Salesloft does not provide a webhook signing standard.
 * Always returns true — callers should restrict webhook ingress by IP or
 * use their own application-level token validation.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

/**
 * Parse a Salesloft webhook payload into canonical WebhookEvents.
 * Salesloft sends `event_type` at the top level of the payload.
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['event_type'] ?? 'unknown')
  const data = payload['data'] as Record<string, unknown> | undefined
  const resourceId = String(data?.['id'] ?? 'unknown')

  return [{
    platform: 'salesloft',
    type: eventType,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId,
    payload,
  }]
}

export const salesloftWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
