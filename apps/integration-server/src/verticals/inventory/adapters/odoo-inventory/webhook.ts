import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Odoo documents no webhook signature. Its External JSON-2 and External RPC
 * API pages describe calls into Odoo, not deliveries out of it, and nothing in
 * them names a signing header or scheme. So no inbound request can be shown to
 * come from the customer's Odoo, and every one is refused.
 *
 * This used to accept an HMAC-SHA256 in `X-Odoo-Signature`, a header Odoo does
 * not send (it was Cin7 Core's scheme with the name changed).
 */
export function verifyOdooInventoryWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return false
}

/** Never reached for a verified delivery, since none verifies. */
export function parseOdooInventoryWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  return []
}

export const OdooInventoryWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyOdooInventoryWebhook,
  parseWebhookEvents: parseOdooInventoryWebhookEvents,
}
