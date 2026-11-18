/**
 * M-Pesa (Daraja) webhook handler.
 *
 * Safaricom's Daraja API does NOT provide cryptographic webhook/callback
 * signature verification (no HMAC-SHA256, no shared-secret header, no RSA
 * signing). The platform relies on network-level controls (IP allowlisting,
 * HTTPS-only callback URLs, and per-transaction secret URL tokens) instead of
 * a per-request signature.
 *
 * Because there is no secret or signature to verify, `verifyWebhook` always
 * returns `false` — fail-closed. Accepting any unsigned POST would allow any
 * party that knows the callback URL to forge a payment notification.
 *
 * Operators who wish to enable M-Pesa callbacks should add an IP allowlist
 * guard at the infrastructure layer (load-balancer, WAF, or a middleware that
 * checks the source IP against Safaricom's published egress ranges) before
 * routing traffic to this handler.
 */

import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/**
 * Always returns `false`.  M-Pesa Daraja has no callback signature scheme, so
 * we cannot verify authenticity — fail closed rather than accept blindly.
 * Never throws.
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
      platform: 'mpesa',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const MpesaWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
