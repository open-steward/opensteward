/**
 * Atome webhook ("Callback") verification + event parsing.
 *
 * When a payment's status changes, Atome POSTs a callback to the `callbackUrl`
 * supplied at create time. The body carries **only** `{ referenceId }` as the
 * status-change indicator — Atome deliberately omits the payment details, and
 * integrators are told to re-read the payment via the Get Payment Information
 * API to drive business logic. There is therefore no dotted event-type or new
 * status in the delivery; we classify every callback as a charge update.
 *
 * Security: Atome signs the callback with **HMAC-SHA256** over the raw HTTP
 * request body using a shared secret, and sends the signature in the
 * `X-Signature` header. We recompute the HMAC and compare in constant time.
 *
 * Docs: https://doc.apaylater.com/v2/ (Callback section)
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify the `X-Signature` HMAC-SHA256 of the raw body against the shared
 * secret. Atome documents a hex-encoded signature; we also tolerate a
 * base64-encoded one, comparing each candidate in constant time.
 */
export function verifyAtomeWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const sig = headers['x-signature'] ?? headers['X-Signature']
    if (!sig) return false

    const candidates = [
      createHmac('sha256', secret).update(payload).digest('hex'),
      createHmac('sha256', secret).update(payload).digest('base64'),
    ]
    const provided = sig.trim()

    return candidates.some((expected) => {
      const a = Buffer.from(provided)
      const b = Buffer.from(expected)
      if (a.length !== b.length) return false
      return timingSafeEqual(a, b)
    })
  } catch {
    return false
  }
}

export function parseAtomeWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const resourceId = String(payload['referenceId'] ?? '')
  return [
    {
      platform: 'atome',
      // The callback is a bare status-change ping; the merchant re-reads the
      // payment to learn the new status, so we classify it as a charge update.
      type: 'payment.updated',
      resourceType: 'charges',
      action: 'updated',
      resourceId,
      payload,
    },
  ]
}

export const AtomeWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyAtomeWebhook,
  parseWebhookEvents: parseAtomeWebhookEvents,
}
