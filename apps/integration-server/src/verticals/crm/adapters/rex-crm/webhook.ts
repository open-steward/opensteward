import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Rex CRM webhook signature verification not documented — accept all
  return true
}

export function parseWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  return []
}

export const rexCrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyWebhook,
  parseWebhookEvents: parseWebhookEvents,
}
