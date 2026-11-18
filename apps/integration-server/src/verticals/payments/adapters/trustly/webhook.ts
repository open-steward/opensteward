/**
 * Trustly notifications (the equivalent of webhooks).
 *
 * Trustly POSTs a signed JSON-RPC envelope to the `NotificationURL` supplied on
 * the original `Deposit`/`Withdraw`/etc. call. Notification methods are
 * `credit`, `debit`, `pending`, `cancel`, `account`, `kyc`, and
 * `payoutconfirmation`. The envelope mirrors a request:
 *
 *   {
 *     "method": "credit",
 *     "params": {
 *       "signature": "<base64 RSA-SHA1 over method+uuid+serialize(data)>",
 *       "uuid": "...",
 *       "data": { "orderid": "...", "messageid": "...", "amount": "10.00",
 *                 "currency": "EUR", "enduserid": "...", "notificationid": "...",
 *                 "timestamp": "...", "attributes": { ... } }
 *     }
 *   }
 *
 * Trustly signs notifications with *its* private key; the merchant verifies with
 * Trustly's public key. We reuse the same alphabetic serialisation + RSA-SHA1
 * scheme as outgoing requests. The verification `secret` is Trustly's public
 * key PEM (configured per integration).
 *
 * Docs:
 *   https://docs.trustly.com/api/notifications-overview
 *   https://docs.trustly.com/api/authentication
 */
import { createVerify } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'
import { serializeData } from './auth'

const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  credit: 'charges',
  debit: 'charges',
  pending: 'charges',
  cancel: 'charges',
  payoutconfirmation: 'payouts',
  account: 'customers',
  kyc: 'customers',
}

const ACTION_MAP: Record<string, WebhookAction> = {
  credit: 'paid',
  debit: 'refunded',
  pending: 'created',
  cancel: 'cancelled',
  payoutconfirmation: 'paid',
  account: 'updated',
  kyc: 'updated',
}

function classify(method: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  const m = method.toLowerCase()
  return { resourceType: RESOURCE_MAP[m] ?? 'unknown', action: ACTION_MAP[m] ?? 'unknown' }
}

/**
 * Verify a Trustly notification signature. Trustly signs
 * `method + uuid + serialize(data)` with its private key (RSA-SHA1); we verify
 * with Trustly's public key PEM (`secret`).
 */
export function verifyTrustlyWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const body = JSON.parse(payload.toString('utf8')) as {
      method?: string
      params?: { signature?: string; uuid?: string; data?: Record<string, unknown> }
    }
    const method = body.method
    const params = body.params
    if (!method || !params?.signature || !params.uuid || !params.data) return false

    const plaintext = method + params.uuid + serializeData(params.data)
    const verifier = createVerify('RSA-SHA1')
    verifier.update(plaintext, 'utf8')
    return verifier.verify(secret, params.signature, 'base64')
  } catch {
    return false
  }
}

export function parseTrustlyWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const method = String(payload['method'] ?? '')
  const params = (payload['params'] as Record<string, unknown> | undefined) ?? {}
  const data = (params['data'] as Record<string, unknown> | undefined) ?? {}
  const resourceId = String(data['orderid'] ?? data['notificationid'] ?? data['messageid'] ?? '')
  const { resourceType, action } = classify(method)
  return [
    {
      id: data['notificationid'] ? String(data['notificationid']) : undefined,
      platform: 'trustly',
      type: method,
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const TrustlyWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyTrustlyWebhook,
  parseWebhookEvents: parseTrustlyWebhookEvents,
}
