/**
 * Payoneer webhook event parsing.
 *
 * Payoneer Checkout (formerly optile) secures webhook notifications with a
 * per-session shared-secret token.  When the merchant creates a payment LIST
 * session via the Payoneer Checkout API the response contains an
 * `identification.securityToken` value.  Payoneer includes that token
 * verbatim in the `List-Security-Token` HTTP header of every notification
 * callback for that session.
 *
 * Verification: constant-time comparison of
 *   headers['list-security-token']  vs  the stored session secret.
 * Fail-closed: returns false when either value is absent or lengths differ.
 *
 * Reference: Payoneer Checkout (optile) WooCommerce plugin source —
 * modules/inpsyde/payoneer-webhooks/src/Controller/PaymentWebhookController.php
 * and modules/inpsyde/payoneer-webhooks/inc/services.php
 * (webhooks.security_header_name = 'List-Security-Token').
 */

import { timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent } from '../../schema/webhook'

/** Header name used by Payoneer Checkout for webhook authentication. */
const SECURITY_HEADER = 'list-security-token'

/**
 * Verify a Payoneer Checkout webhook notification.
 *
 * @param _payload  Raw request body (unused — Payoneer uses a header token,
 *                  not a body signature).
 * @param headers   Incoming request headers (lower-cased).
 * @param secret    The per-session `List-Security-Token` value stored when
 *                  the payment LIST session was created.
 * @returns `true` only when the header token matches the stored secret.
 *          Never throws — returns `false` on any error or missing value.
 */
export function verifyWebhook(
  _payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const token = headers[SECURITY_HEADER]
    if (!token || !secret) return false

    const a = Buffer.from(token)
    const b = Buffer.from(secret)
    if (a.length !== b.length) return false

    return timingSafeEqual(a, b)
  } catch {
    return false
  }
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
      platform: 'payoneer',
      type,
      resourceType: 'unknown',
      action: 'unknown',
      resourceId,
      payload,
    },
  ]
}

export const PayoneerWebhookHandler: WebhookHandler = {
  verifyWebhook,
  parseWebhookEvents,
}
