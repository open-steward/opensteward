import type { WebhookEvent } from '../../schema/webhook'

/**
 * Recruiterflow does not document a webhook signature scheme.
 * verifyWebhook returns true (pass-through) until a scheme is documented.
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

export const recruiterflowWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
