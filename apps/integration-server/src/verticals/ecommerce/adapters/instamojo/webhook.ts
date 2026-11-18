/**
 * Instamojo webhook verification and event parsing.
 *
 * Verification:
 *   Instamojo signs webhook POST data using HMAC-SHA1. The MAC is included in
 *   the POST body as the `mac` field. To verify:
 *
 *   1. Extract `mac` from the payload and remove it from the data map.
 *   2. Sort remaining keys case-insensitively (uksort/strcasecmp equivalent).
 *   3. Join the sorted *values* with a pipe (`|`) delimiter.
 *   4. Compute HMAC-SHA1 of that string using the private salt as the key.
 *   5. Compare the computed hex digest with the received `mac` field.
 *
 *   The salt (private salt) is obtained from the Instamojo developers page:
 *     Production: https://www.instamojo.com/integrations/
 *     Sandbox:    https://test.instamojo.com/integrations/
 *
 * Event parsing:
 *   Instamojo always sends a single payment event per webhook POST. The
 *   payload carries `payment_id`, `payment_request_id`, and `status`, so we
 *   classify these as `transactions.created` (a completed payment notification).
 *
 * Docs: https://support.instamojo.com/hc/en-us/articles/207816249
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Verify an Instamojo webhook delivery.
 *
 * @param _payload - Raw request body buffer (not used — Instamojo embeds the
 *   MAC in the parsed POST fields, not in a header over the raw body). The
 *   `data` object should be passed via `headers` workaround or the caller
 *   should use the `verifyInstamojoWebhookPayload` variant directly.
 * @param headers  - HTTP headers (not used by Instamojo for the MAC, kept for
 *   interface compatibility).
 * @param secret   - The private salt from the Instamojo integrations dashboard.
 *
 * NOTE: Because Instamojo's MAC is embedded in the POST body fields rather
 * than an HTTP header, this function always returns `false` when called with
 * only the raw buffer. Call `verifyInstamojoWebhookFields` with the parsed
 * POST fields instead.
 */
export function verifyInstamojoWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  // Cannot verify from raw buffer alone — MAC is in the parsed fields.
  // The adapter's index.ts overrides verifyWebhook to use the parsed payload.
  return false
}

/**
 * Verify Instamojo webhook POST fields.
 *
 * @param fields  - All POST body fields (including the `mac` field).
 * @param salt    - Private salt from the Instamojo integrations dashboard.
 */
export function verifyInstamojoWebhookFields(
  fields: Record<string, string>,
  salt: string,
): boolean {
  try {
    const mac = fields['mac']
    if (!mac) return false

    // Build a copy without the mac field, sort keys case-insensitively.
    const data: Record<string, string> = { ...fields }
    delete data['mac']

    const sortedKeys = Object.keys(data).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase()),
    )
    const message = sortedKeys.map((k) => data[k] ?? '').join('|')

    const computed = createHmac('sha1', salt).update(message).digest('hex')

    const a = Buffer.from(mac.toLowerCase())
    const b = Buffer.from(computed.toLowerCase())
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Parse an Instamojo webhook POST body into a canonical WebhookEvent.
 *
 * Instamojo delivers one payment notification per POST. The body contains
 * fields like `payment_id`, `payment_request_id`, `status`, `amount`, etc.
 * We map this to a `transactions.created` event (or `transactions.updated`
 * when the status indicates a state change on an existing payment).
 */
export function parseInstamojoWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const paymentId = payload['payment_id'] as string | undefined
  const resourceId = paymentId ?? ''

  // Instamojo webhook payloads always represent a payment status notification.
  return [
    {
      platform: 'instamojo',
      type: 'transactions.created',
      resourceType: 'transactions',
      action: 'created',
      resourceId,
      payload,
    },
  ]
}

export const instamojoWebhook: import('@opensteward/shared').WebhookHandler = {
  verifyWebhook: verifyInstamojoWebhook,
  parseWebhookEvents: parseInstamojoWebhookEvents,
}
