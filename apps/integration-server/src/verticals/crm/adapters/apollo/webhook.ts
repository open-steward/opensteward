import type { WebhookEvent } from '../../schema/webhook'

/**
 * Apollo webhooks do not include a signature — always return true.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

/**
 * Parse an Apollo webhook payload into canonical WebhookEvent(s).
 *
 * Apollo sends an `event_type` field to identify the event kind.
 */
export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = String(payload['event_type'] ?? 'unknown')
  const id = String(
    (payload['id'] as string | number | undefined) ?? 'unknown',
  )
  return [{
    platform: 'apollo',
    type,
    resourceType: 'unknown',
    action: 'unknown',
    resourceId: id,
    payload,
  }]
}

export const apolloWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
