/**
 * Crelate webhook handler.
 *
 * Crelate does not document a cryptographic webhook signature scheme,
 * so verification always returns true (accept all inbound events).
 * Operators should restrict the inbound URL at the network level.
 */

import type { WebhookEvent } from '../../schema/webhook'

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

export const crelateWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
