import type { WebhookEvent } from '../../schema/webhook'

/**
 * Barantum webhook verification and parsing.
 *
 * Docs: https://docs.barantum.com/ (Postman collection — Webhook Events)
 *
 * Barantum does not document a cryptographic webhook signature scheme.
 * verifyWebhook is a pass-through (always returns true) until a scheme is
 * published. parseWebhookEvents returns an empty array (stub) — extend when
 * the event envelope shape is confirmed.
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

export const barantumWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
