/**
 * Wasp InventoryCloud webhook support.
 *
 * As of the current InventoryCloud public API documentation, no outbound
 * webhook / event-push mechanism with HMAC or JWT signing is documented.
 * The platform is a polling-only integration target.
 *
 * These stubs satisfy the InventoryAdapter interface but will never be called
 * in production.  If Wasp adds webhook support in the future, implement:
 *   verifyWaspBarcodeWebhook  — check HMAC-SHA256 over body using a shared secret
 *   parseWaspBarcodeWebhookEvents — map payload to canonical WebhookEvent[]
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyWaspBarcodeWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // No webhook signing documented; reject all inbound webhook calls.
  return false
}

export function parseWaspBarcodeWebhookEvents(
  _payload: Record<string, unknown>,
): WebhookEvent[] {
  // No webhook events supported.
  return []
}

export const WaspBarcodeWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyWaspBarcodeWebhook,
  parseWebhookEvents: parseWaspBarcodeWebhookEvents,
}
