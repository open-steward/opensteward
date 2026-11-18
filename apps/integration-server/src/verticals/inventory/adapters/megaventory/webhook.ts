/**
 * Megaventory webhook handling.
 *
 * **Megaventory webhooks cannot be authenticated, so this verifier rejects.**
 *
 * Subscriptions are created with `EventSubscriptionAdd`, whose entire request
 * body — read from the live service's own metadata on 2026-09-18
 * (https://api.megaventory.com/v2017a/json/metadata?op=EventSubscriptionAdd) —
 * is:
 *
 *   { "APIKEY": "...", "mvEvent": { "EventID": 0, "EventType": "String",
 *                                   "Application": "String",
 *                                   "ListenerURL": "String" } }
 *
 * There is no secret field anywhere in that contract, and none is returned.
 * No shared secret is ever exchanged, so Megaventory has nothing to sign with
 * and a receiver has nothing to verify against.
 *
 * Until this rewrite the file claimed to verify an HMAC-SHA256 hex digest in
 * an `x-megaventory-signature` header. Megaventory sends no such header and
 * could not compute one — the scheme was inherited from the Cin7 Core
 * reference adapter this file was copied from.
 *
 * The choice made here is to FAIL CLOSED. Returning `true` — "no signature to
 * verify, accept all", which is what some adapters in this repo do for
 * unsigned platforms — would mean anyone who learns the callback URL can post
 * arbitrary inventory events as though they came from Megaventory. Rejecting
 * means Megaventory webhooks do not deliver, which is a missing feature rather
 * than a false claim of authenticity, and `metadata.ts` says so.
 *
 * To make this work, Megaventory would have to publish a signing scheme.
 */
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

export function verifyMegaventoryWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // No secret is exchanged at subscription time, so no payload can be
  // authenticated. See the file header.
  return false
}

/**
 * Parsing is still implemented so that a future signed scheme — or an operator
 * terminating authenticity at the edge — has a working mapping rather than a
 * stub.
 *
 * `EventType` is the field `EventSubscriptionAdd` subscribes by. Its permitted
 * values are not enumerated anywhere in the live metadata, so nothing is
 * mapped to a canonical resource on the strength of a guessed name: the type
 * is passed through verbatim and classified `unknown`.
 */
export function parseMegaventoryWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const event = (payload['mvEvent'] as Record<string, unknown> | undefined) ?? payload
  const type = String(event['EventType'] ?? '')
  const resourceId = String(event['EntityID'] ?? event['entityID'] ?? event['EventID'] ?? '')
  return [
    {
      id: `megaventory:${type}:${resourceId}`,
      platform: 'megaventory',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const MegaventoryWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyMegaventoryWebhook,
  parseWebhookEvents: parseMegaventoryWebhookEvents,
}
