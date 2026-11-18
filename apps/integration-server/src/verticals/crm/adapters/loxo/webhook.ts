/**
 * Loxo webhook handler.
 *
 * Loxo does not document a signed-webhook protocol (no HMAC or secret header).
 * The verifyWebhook method accepts all incoming payloads (returns true).
 * parseWebhookEvents returns an empty array — webhook event normalisation is
 * not currently implemented for Loxo.
 */
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Loxo has no documented HMAC signature; accept all payloads.
  return true
}

export function parseWebhookEvents(
  _payload: Record<string, unknown>,
): WebhookEvent[] {
  return []
}

export const loxoWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
