/**
 * Nacelle webhook verification and event parsing.
 *
 * Verification (fully documented, verbatim from
 * https://docs.nacelle.com/docs/noms-authentication):
 *
 *   signature, _ := strings.CutPrefix(r.Header.Get("x-nacelle-signature-sha256"), "sha256=")
 *   func getSignature(buf *bytes.Buffer, secret string) string {
 *       s := hmac.New(sha256.New, []byte(secret))
 *       _, _ = buf.WriteTo(s)
 *       return hex.EncodeToString(s.Sum(nil))
 *   }
 *
 * i.e. HMAC-SHA256 of the raw body, HEX-encoded (not base64 — this is where
 * the byte-identical-to-Shopify copy this adapter replaces was wrong: Shopify
 * signs base64), compared against the `sha256=`-prefixed
 * `x-nacelle-signature-sha256` header.
 *
 * Event parsing: Nacelle's webhook CONFIG API (`upsertWebhook` —
 * https://docs.nacelle.com/reference/webhook-config-graphql-api) takes only
 * `id` / `url` / `secret` / `createdBy` — there is no `event`/`topic`/`type`
 * field, and no delivered-payload example is published anywhere in Nacelle's
 * docs. Combined with NOMS "Syndicate" being described (docs/noms-syndicate)
 * purely as "Nacelle pushes the order DATA to your specified endpoint using a
 * webhook", the documented use of this mechanism is order syndication, not a
 * general multi-resource/multi-topic event bus. So every verified delivery is
 * classified as an `orders` event; without a documented topic field the
 * specific action cannot be determined, so `action` is `updated` when the
 * payload looks like a NOMS Order (has `id` + `status`) and `unknown`
 * otherwise — this is reported as a known gap, not invented.
 */

import { verifyHmacSha256 } from '@opensteward/shared'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'

const SIGNATURE_PREFIX = 'sha256='

/**
 * Deliberately NOT `verifyGithubStyleSignature` (which strips the `sha256=`
 * prefix only when present and otherwise hashes the header value as-is): a
 * header missing the documented prefix is a malformed delivery and must be
 * rejected outright, not treated as if the raw header were the digest.
 */
export function verifyNacelleWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  const header = headers['x-nacelle-signature-sha256'] ?? headers['X-Nacelle-Signature-Sha256']
  if (!header || !header.startsWith(SIGNATURE_PREFIX)) return false
  const signature = header.slice(SIGNATURE_PREFIX.length)
  return verifyHmacSha256(payload, secret, signature, 'hex')
}

export function parseNacelleWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const rawId = payload['id']
  const resourceId = rawId == null ? '' : String(rawId)
  const looksLikeOrder = typeof payload['status'] === 'string' && rawId != null

  const resourceType: WebhookResourceType = 'orders'
  const action: WebhookAction = looksLikeOrder ? 'updated' : 'unknown'

  return [
    {
      platform: 'nacelle',
      type: `${resourceType}.${action}`,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

/** Registered by the generated `../../webhooks.ts`; keep this the only handler export. */
export const nacelleWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyNacelleWebhook,
  parseWebhookEvents: parseNacelleWebhookEvents,
}
