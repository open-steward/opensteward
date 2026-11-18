/**
 * SAP S/4HANA Cloud does NOT expose inventory-management webhooks via a
 * simple HMAC-signed HTTP callback.  Real-time events are delivered through
 * SAP Event Mesh (AMQP/CloudEvents over SAP BTP) — a separate, brokered
 * channel that is outside the scope of a REST adapter.
 *
 * This file intentionally exports no-op stubs so that the adapter satisfies
 * the InventoryAdapter interface (verifyWebhook / parseWebhookEvents are
 * optional) without any false signature-verification logic.
 *
 * If SAP BTP Event Mesh support is added in the future, the real JWS/JWT
 * verification approach (RS256, validated against the SAP XSUAA JWKS
 * endpoint) should be implemented here.
 */
import type { WebhookHandler } from '@opensteward/shared'

/**
 * verifyWebhook — always returns false.
 * SAP S/4HANA does not deliver signed HTTP webhook callbacks for inventory.
 */
export function verifySapInventoryWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return false
}

/**
 * parseWebhookEvents — returns an empty array.
 * No HTTP-push webhook format is standardised for SAP inventory events.
 */
export function parseSapInventoryWebhookEvents(
  _payload: Record<string, unknown>,
): never[] {
  return []
}

export const SapInventoryWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySapInventoryWebhook,
  parseWebhookEvents: parseSapInventoryWebhookEvents,
}
