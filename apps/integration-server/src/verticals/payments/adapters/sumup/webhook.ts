/**
 * SumUp webhook handler.
 *
 * SumUp's online-payments webhook API does not provide a cryptographic
 * signature scheme (no HMAC secret, no shared-secret header, no public-key
 * signing).  Their own documentation advises consumers to "verify if the event
 * really took place by calling a relevant SumUp API" rather than verifying an
 * inbound signature.
 *
 * Because we cannot verify that a POST to our endpoint genuinely originated
 * from SumUp, verifyWebhook returns false unconditionally — the router will
 * respond 401 for every inbound SumUp webhook request.  This is the secure
 * fail-closed default: an attacker cannot forge accepted events, and no
 * unsigned payload will ever be processed.
 *
 * When SumUp publishes a signature scheme this function should be updated to
 * perform real cryptographic verification.
 */

import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Always returns false — SumUp provides no verifiable signature.
 * The router translates this to an HTTP 401 response.
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
      platform: 'sumup',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const SumupWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
