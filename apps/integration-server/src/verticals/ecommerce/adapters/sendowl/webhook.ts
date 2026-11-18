/**
 * SendOwl webhook verification and event parsing.
 *
 * Verification: docs at https://help.sendowl.com/help/using-web-hooks
 * (2026-09-13). SendOwl signs the raw request body and sends the digest in
 * the `X-SENDOWL-HMAC-SHA256` header (lower-cased by Fastify to
 * `x-sendowl-hmac-sha256`), computed as:
 *
 *   base64(HMAC-SHA256(raw_request_body, <account's signing key secret>))
 *
 * matching the docs' own Ruby example:
 *
 *   digest = OpenSSL::Digest.new('sha256')
 *   calculated_hmac = Base64.encode64(
 *     OpenSSL::HMAC.digest(digest, YOUR_SIGNING_KEY_SECRET, request.raw_post)
 *   ).strip
 *   calculated_hmac == request.headers["HTTP_X_SENDOWL_HMAC_SHA256"]
 *
 * The signing key secret is configured per-account under Settings →
 * Advanced settings → Developer → SendOwl API, separately from the API
 * key/secret pair used for outbound Basic auth (`./client.ts`) — it is
 * supplied to `verifyWebhook` as the connection's stored `webhookSecret`.
 *
 * Event parsing: the help page names 15 event types by their dashboard
 * display label (e.g. "Order completed", "Refund issued") but never
 * documents the machine-readable string SendOwl actually sends to identify
 * which one fired, or that any such field exists in the body at all — a
 * webhook is configured with a single fixed event type per URL in the
 * dashboard, so a payload's shape alone doesn't disambiguate reliably
 * either. Rather than guess an event-name string or a body field that was
 * never verified, `parseSendOwlWebhookEvents` always reports
 * `resourceType`/`action` as `'unknown'` — the raw payload is preserved in
 * full so a caller with out-of-band knowledge of which URL fired can still
 * recover it.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

export function verifySendOwlWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const headerSig = headers['x-sendowl-hmac-sha256'] ?? headers['X-SENDOWL-HMAC-SHA256']
    if (!headerSig || !secret) return false

    const expected = createHmac('sha256', secret).update(payload).digest('base64')
    const a = Buffer.from(headerSig)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Parse a SendOwl webhook delivery into zero-or-one canonical events.
 *
 * `resourceType`/`action` are always `'unknown'` — see the header comment
 * for why guessing either is not honest here. `resourceId` comes from the
 * confirmed `order.id` field embedded on every documented order-lifecycle
 * payload (see `../transform/order.ts`); with no order id at all there is
 * nothing genuine to report, so the delivery is dropped rather than
 * emitting a required id field with a fabricated placeholder.
 */
export function parseSendOwlWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const order = payload['order'] as Record<string, unknown> | undefined
  const rawId = order?.['id'] ?? payload['id']
  if (rawId == null) return []

  return [
    {
      platform: 'sendowl',
      type: 'unknown.unknown',
      resourceType: 'unknown',
      action: 'unknown',
      resourceId: String(rawId),
      payload,
    },
  ]
}

export const sendowlWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifySendOwlWebhook,
  parseWebhookEvents: parseSendOwlWebhookEvents,
}
