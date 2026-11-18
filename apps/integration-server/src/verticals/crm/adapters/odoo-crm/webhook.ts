import type { WebhookEvent } from '../../schema/webhook'

/**
 * Odoo documents no webhook signature. Its External JSON-2 and External RPC
 * API pages describe calls into Odoo, not deliveries out of it, and nothing
 * in them names a signing header or scheme. So no inbound request can be
 * shown to come from the customer's Odoo, and every one is refused: accepting
 * them would let anyone who knows the URL inject events.
 *
 * Until now this returned `true` for everything.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return false
}

/** Never reached for a verified delivery, since none verifies. */
export function parseWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  return []
}

export const odooCrmWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
