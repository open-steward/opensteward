/**
 * Viva.com webhook handler — fail-closed stub.
 *
 * Research (June 2026) confirms that Viva.com does NOT provide a per-request
 * cryptographic signature (HMAC, RSA, shared-secret header, etc.) on standard
 * payment-event POST webhooks. Their security model relies on:
 *   1. A one-time endpoint-ownership challenge (GET → respond with a key from
 *      GET /api/messages/config/token) performed during webhook registration.
 *   2. IP allowlisting of Viva's published source IPs at the network perimeter.
 *   3. Transaction re-verification via the Retrieve Transaction API using the
 *      transactionId in the payload.
 *
 * None of these mechanisms provide a per-request secret or signature that can
 * be verified in verifyWebhook() at receive-time. Therefore, verifyWebhook
 * always returns false (fail-closed). Every inbound POST to
 * /webhooks/payments/viva-com is rejected with 401 rather than accepted
 * blindly. Operators who need to receive Viva.com webhooks should implement
 * network-level IP allowlisting and transaction re-verification at their
 * ingress layer instead of relying on this handler.
 *
 * When Viva.com adds a documented per-request signing scheme, replace the
 * stub below with a real constant-time HMAC comparison.
 */

import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Always returns false — no verifiable signature scheme is available for
 * Viva.com standard payment webhooks. Fail-closed is the correct default.
 */
export function verifyWebhook(
  _payload: Buffer,
  _headers: Record<string, string>,
  _secret: string,
): boolean {
  return false
}

export function parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type =
    typeof payload['type'] === 'string'
      ? payload['type']
      : typeof payload['event'] === 'string'
        ? payload['event']
        : String(payload['type'] ?? '')
  const id = typeof payload['id'] === 'string' ? payload['id'] : undefined
  const dataObj =
    typeof payload['data'] === 'object' && payload['data'] !== null
      ? (payload['data'] as Record<string, unknown>)
      : {}
  const resourceId =
    typeof payload['resource_id'] === 'string'
      ? payload['resource_id']
      : typeof dataObj['id'] === 'string'
        ? dataObj['id']
        : ''
  return [
    {
      id,
      platform: 'viva-com',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const VivaComWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
