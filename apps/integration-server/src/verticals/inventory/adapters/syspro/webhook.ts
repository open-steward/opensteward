/**
 * SYSPRO webhook support.
 *
 * SYSPRO 8 OData is a read-only polling API. No outbound webhook / push
 * notification mechanism is documented for on-premise or cloud installations.
 * Verification and parsing are therefore no-ops that always return safe values.
 *
 * If SYSPRO ever publishes a signed webhook spec, implement HMAC verification
 * here and update the adapter methods in index.ts.
 */
import type { WebhookHandler } from '@opensteward/shared'

export function verifySysproWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // No signed webhook spec documented — reject all inbound webhook calls.
  return false
}

export function parseSysproWebhookEvents(
  _payload: Record<string, unknown>,
): never[] {
  return []
}

export const SysproWebhookHandler: WebhookHandler = {
  verifyWebhook: verifySysproWebhook,
  parseWebhookEvents: parseSysproWebhookEvents,
}
