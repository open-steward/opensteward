/**
 * IXOPAY callback (webhook) verification + parsing.
 *
 * IXOPAY posts transaction status-change notifications to the merchant's
 * `callbackUrl`. Authenticity is proven with the SAME HMAC-SHA512 scheme as
 * API requests (see `client.ts`): the signature ships in the `X-Signature`
 * header, computed over a 5-field newline-joined message:
 *
 *   message = METHOD \n SHA512_HEX(body) \n CONTENT_TYPE \n DATE \n REQUEST_URI
 *   X-Signature = BASE64( HMAC-SHA512( message, key = sharedSecret ) )
 *
 * The HMAC key is the connector shared secret. A correct RFC-7231 `Date`
 * header is required to rebuild the signature; IXOPAY also accepts an
 * equivalent `X-Date` header that takes precedence when present.
 *
 * Verifying callbacks is recommended (not required) because the callback is the
 * one channel where TLS cannot prove IXOPAY's identity. The merchant must reply
 * HTTP 200 with a body of exactly `OK`.
 *
 * The callback JSON payload carries: `result` (OK | PENDING | ERROR), `uuid`,
 * `merchantTransactionId`, `purchaseId`, `transactionType` (DEBIT | PREAUTHORIZE
 * | CAPTURE | VOID | REFUND | REGISTER | DEREGISTER | PAYOUT | CHARGEBACK |
 * CHARGEBACK-REVERSAL), `paymentMethod`, `amount`, `currency`, `returnData`,
 * `errors`, `extraData`.
 *
 * Docs: https://documentation.ixopay.com/docs/guides/getting-started/callbacks
 *       https://documentation.ixopay.com/docs/guides/production/additional-security
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type { WebhookEvent, WebhookResourceType, WebhookAction } from '../../schema/webhook'
import { JSON_CONTENT_TYPE } from './constants'

/** IXOPAY `transactionType` → canonical resource type. */
const RESOURCE_MAP: Record<string, WebhookResourceType> = {
  DEBIT: 'charges',
  PREAUTHORIZE: 'charges',
  CAPTURE: 'charges',
  VOID: 'charges',
  PAYOUT: 'payouts',
  REFUND: 'refunds',
  REGISTER: 'customers',
  DEREGISTER: 'customers',
  CHARGEBACK: 'disputes',
  'CHARGEBACK-REVERSAL': 'disputes',
}

/**
 * Classify a callback into (resourceType, action) from its `transactionType`
 * and `result` (OK | PENDING | ERROR).
 */
function classify(transactionType: string, result: string): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const type = transactionType.toUpperCase()
  const resourceType = RESOURCE_MAP[type] ?? 'unknown'
  const outcome = result.toUpperCase()

  let action: WebhookAction
  if (outcome === 'ERROR') action = 'failed'
  else if (outcome === 'PENDING') action = 'created'
  else if (type === 'VOID') action = 'cancelled'
  else if (type === 'REFUND') action = 'refunded'
  else if (type === 'REGISTER') action = 'created'
  else if (type === 'DEREGISTER') action = 'deleted'
  else if (type === 'CHARGEBACK' || type === 'CHARGEBACK-REVERSAL') action = 'disputed'
  else if (outcome === 'OK') action = 'paid'
  else action = 'unknown'

  return { resourceType, action }
}

/**
 * Rebuild the IXOPAY signature for a POSTed callback and compare it, in
 * constant time, to the one in the `X-Signature` header. Returns false on any
 * missing/garbled input rather than throwing.
 *
 * @param payload  Raw callback body bytes (before JSON parsing).
 * @param headers  Lower-cased request headers (must include `x-signature` and a
 *                 `date` / `x-date`; optionally `x-request-uri` for the URI).
 * @param secret   Connector shared secret (HMAC key).
 */
export function verifyIxopayWebhook(
  payload: Buffer,
  headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const provided = headers['x-signature'] ?? headers['X-Signature']
    if (!provided) return false
    const date = headers['x-date'] ?? headers['date'] ?? ''
    if (!date) return false
    const contentType = headers['content-type'] ?? JSON_CONTENT_TYPE
    // The signed URI is the request path; IXOPAY templates differ per merchant
    // route, so honour an explicit `x-request-uri` header when the gateway in
    // front forwards it, else fall back to the empty string IXOPAY uses for
    // root callbacks.
    const requestUri = headers['x-request-uri'] ?? ''

    const bodyHash = createHash('sha512').update(payload).digest('hex')
    // 5-field message: METHOD \n SHA512_HEX(body) \n CONTENT_TYPE \n DATE \n REQUEST_URI
    const message = ['POST', bodyHash, contentType, date, requestUri].join('\n')
    const expected = createHmac('sha512', secret).update(message, 'utf8').digest('base64')

    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function parseIxopayWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const transactionType = String(payload['transactionType'] ?? '')
  const result = String(payload['result'] ?? '')
  const resourceId = String(payload['uuid'] ?? payload['merchantTransactionId'] ?? '')
  const { resourceType, action } = classify(transactionType, result)
  return [
    {
      platform: 'ixopay',
      type: transactionType ? `${transactionType.toLowerCase()}.${(result || 'unknown').toLowerCase()}` : 'unknown',
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const IxopayWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyIxopayWebhook,
  parseWebhookEvents: parseIxopayWebhookEvents,
}
