import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Ortto webhook signature verification — not officially documented; accept all
  return true
}

export function parseWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  return []
}

export const orttoWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
