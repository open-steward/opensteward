/**
 * StoreFeeder webhook support.
 *
 * StoreFeeder does NOT document any outbound webhook capability or HMAC/JWT
 * signing scheme in its public REST API documentation (https://rest.storefeeder.com/Help).
 * Both verifyWebhook and parseWebhookEvents are no-ops / stubs.
 *
 * If StoreFeeder adds webhook support in the future, implement:
 *   - verifyWebhook: check the X-StoreFeeder-Signature header
 *   - parseWebhookEvents: map event type strings to canonical resourceType/action
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyStoreFeederWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
  // Webhooks not supported; always return false so the caller rejects unsigned payloads.
  return false
}

export function parseStoreFeederWebhookEvents(_payload: Record<string, unknown>): WebhookEvent[] {
  return []
}

export const StoreFeederWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyStoreFeederWebhook,
  parseWebhookEvents: parseStoreFeederWebhookEvents,
}
