/**
 * EBANX payment notifications.
 *
 * EBANX POSTs a form-urlencoded body to the merchant's Notification URL on
 * every status change:
 *
 *   operation=payment_status_change&notification_type=update&hash_codes=<h1,h2,…>
 *
 * `notification_type` is one of `update | refund | chargeback | chargeback_credit`.
 * The body carries no payment detail — the merchant must call /ws/query with
 * each hash in `hash_codes` to learn the new status.
 *
 * Each request is RSA-SHA1 signed. EBANX exposes the matching public
 * certificate for download, keyed by `X-Signature-Fingerprint`:
 *
 *   X-Signature-Type:        rsa,sha1
 *   X-Signature-Fingerprint: 4ABAD89CF66B99998465470550EB15E3E271A246
 *   X-Signature-Content:     <base64 RSA-SHA1 signature of the raw body>
 *
 * We verify the signature against the merchant-supplied EBANX public key
 * (the PEM passed in as the webhook `secret`). Because EBANX signs with an
 * asymmetric key — not a shared HMAC secret — there is nothing to leak by
 * storing the public cert as the connection's webhook secret.
 *
 * Docs: https://docs.ebanx.com/docs/payments/guides/features/payment-notifications/
 */
import { createVerify } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const ACTION_MAP: Record<string, WebhookAction> = {
  update: 'updated',
  refund: 'refunded',
  chargeback: 'disputed',
  chargeback_credit: 'updated',
}

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  update: 'charges',
  refund: 'refunds',
  chargeback: 'disputes',
  chargeback_credit: 'disputes',
}

function header(headers: Record<string, string>, name: string): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()]
}

/**
 * Verify the RSA-SHA1 signature over the raw notification body.
 *
 * @param secret  EBANX's notification public certificate (PEM), supplied as
 *                the connection's webhook secret. When absent we fail closed.
 */
export function verifyEbanxWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const sig = header(headers, 'x-signature-content')
    if (!sig) return false
    // PEM may arrive with literal "\n" escapes if it round-tripped via env/JSON.
    const publicKey = secret.includes('-----BEGIN')
      ? secret.replace(/\\n/g, '\n')
      : secret
    const verifier = createVerify('RSA-SHA1')
    verifier.update(payload)
    verifier.end()
    return verifier.verify(publicKey, sig, 'base64')
  } catch {
    return false
  }
}

/**
 * Parse a form-urlencoded EBANX notification into one canonical event per
 * hash in `hash_codes`. The control plane parses the body first; this
 * accepts either the decoded record or a raw `{ body: '<urlencoded>' }`.
 */
export function parseEbanxWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const fields = normaliseFields(payload)
  const notificationType = String(fields['notification_type'] ?? 'update').toLowerCase()
  const operation = String(fields['operation'] ?? 'payment_status_change')
  const hashes = String(fields['hash_codes'] ?? '')
    .split(',')
    .map((h) => h.trim())
    .filter((h) => h !== '')

  const resourceType = RESOURCE_MAP[notificationType] ?? 'unknown'
  const action = ACTION_MAP[notificationType] ?? 'unknown'
  const ids = hashes.length > 0 ? hashes : ['']

  return ids.map((resourceId) => ({
    platform: 'ebanx',
    type: `${operation}.${notificationType}`,
    resourceType,
    action,
    resourceId,
    payload,
  }))
}

/** Accept a decoded record, or decode a raw urlencoded body if present. */
function normaliseFields(payload: Record<string, unknown>): Record<string, string> {
  if (typeof payload['body'] === 'string') {
    const out: Record<string, string> = {}
    for (const [k, v] of new URLSearchParams(payload['body'])) out[k] = v
    return out
  }
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(payload)) {
    if (v != null) out[k] = String(v)
  }
  return out
}

export const EbanxWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyEbanxWebhook,
  parseWebhookEvents: parseEbanxWebhookEvents,
}
