/**
 * Eudonet webhook support.
 *
 * Eudonet does not publish a documented webhook signature scheme for the
 * EudoAPI at this time. Signature verification is therefore not implemented;
 * all payloads are accepted (return true) and events are left unparsed.
 *
 * If Eudonet adds HMAC or token-based verification in a future release this
 * file should be updated to perform the actual check before returning true.
 */

import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // No documented signature scheme — accept all incoming payloads.
  return true
}

export function parseWebhookEvents(
  _payload: Record<string, unknown>,
): WebhookEvent[] {
  // Eudonet webhook payload shape is not publicly documented.
  // Return an empty array; raw payload is available to callers unchanged.
  return []
}

export const eudonetWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
