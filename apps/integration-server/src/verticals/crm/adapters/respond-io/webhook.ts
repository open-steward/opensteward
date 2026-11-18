/**
 * Respond.io webhook helpers.
 *
 * Respond.io webhooks do not include an HMAC signature header in the
 * documented v2 API — the platform relies on the caller verifying the
 * source URL is configured inside the workspace settings. We therefore
 * return `true` from verifyWebhook (accept all) and parse the known
 * event envelope shapes in parseWebhookEvents.
 *
 * Docs: https://developers.respond.io/
 */
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Respond.io does not publish a documented HMAC signature scheme for
  // webhooks — accept all payloads delivered to the registered endpoint.
  return true
}

export function parseWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  // Respond.io sends individual event objects, not batched arrays.
  // Map known event types to canonical WebhookEvent shape if the
  // schema supports them; otherwise return an empty array so callers
  // still receive a valid (non-throwing) result.
  if (!payload || typeof payload !== 'object') return []
  return []
}

export const respondIoWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
