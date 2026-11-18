import type { WebhookEvent } from '../../schema/webhook'

/**
 * Nimble does not support webhooks.
 * verifyWebhook always returns true; parseWebhookEvents returns an empty array.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return true
}

export function parseWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  return []
}

export const nimbleWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
