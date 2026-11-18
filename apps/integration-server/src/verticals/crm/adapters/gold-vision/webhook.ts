/**
 * Gold-Vision webhook support.
 *
 * Gold-Vision does not publicly document a webhook signature verification
 * scheme at this time.  Signature verification is therefore a no-op pass-
 * through (returns true for all payloads).
 *
 * Event parsing returns an empty array — platform-specific mapping can be
 * added once Gold-Vision documents their webhook payload format.
 */

import type { WebhookEvent } from '../../schema/webhook'

export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // No documented signature scheme — accept all.
  return true
}

export function parseWebhookEvents(
  _payload: Record<string, unknown>,
): WebhookEvent[] {
  // Gold-Vision webhook payload format not yet documented.
  return []
}

export const goldVisionWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
