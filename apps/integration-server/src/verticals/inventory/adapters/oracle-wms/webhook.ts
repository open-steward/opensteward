/**
 * Oracle WMS Cloud — webhook support
 *
 * Oracle WMS Cloud does NOT expose push-based webhooks with HMAC/JWT
 * payload signing. Integration is achieved via REST polling (lgfapi).
 *
 * This module exists only to satisfy the InventoryAdapter interface shape;
 * verifyWebhook always returns false and parseWebhookEvents returns an
 * empty array so callers receive a clear signal rather than a runtime throw.
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyOracleWmsWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
  return false
}

export function parseOracleWmsWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  return []
}

export const OracleWmsWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyOracleWmsWebhook,
  parseWebhookEvents: parseOracleWmsWebhookEvents,
}
