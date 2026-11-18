/**
 * Nuvei DMN (Direct Merchant Notification) verification + event parsing.
 *
 * Nuvei pushes payment DMNs as `application/x-www-form-urlencoded` HTTP
 * requests. Authenticity is proven by `advanceResponseChecksum`: the SHA-256
 * hex digest of the merchant secret key followed by a fixed set of DMN field
 * values, in this exact order:
 *
 *   merchantSecretKey + totalAmount + currency + responseTimeStamp
 *     + ppp_TransactionID + Status + productId
 *
 * Field values in the raw query string have spaces encoded as `+`; once the
 * body is form-decoded those become real spaces, which is what Nuvei hashed,
 * so we verify against the *decoded* values. (Some sites are configured for
 * MD5 instead of SHA-256; SHA-256 is the recommended/default and the only one
 * we accept here.)
 *
 * Docs: https://docs.nuvei.com/documentation/integration/webhooks/payment-dmns/
 */
import { createHash, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

function field(record: Record<string, unknown>, ...names: string[]): string {
  for (const n of names) {
    const v = record[n]
    if (v !== undefined && v !== null && v !== '') return String(v)
  }
  return ''
}

/**
 * Re-compute `advanceResponseChecksum` from the DMN body and compare.
 *
 * @param payload  Raw request body (form-encoded). Parsed here so the same
 *                 verifier works whether the framework hands us the buffer or
 *                 a pre-parsed map.
 * @param headers  Unused — Nuvei carries the signature in the body, not a header.
 * @param secret   The merchant secret key.
 */
export function verifyNuveiWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    if (!secret) return false
    const params = new URLSearchParams(payload.toString('utf8'))
    const get = (...names: string[]): string => {
      for (const n of names) {
        const v = params.get(n)
        if (v !== null && v !== '') return v
      }
      return ''
    }
    const provided = get('advanceResponseChecksum')
    if (!provided) return false

    const concatenated =
      secret +
      get('totalAmount') +
      get('currency') +
      get('responseTimeStamp') +
      get('PPP_TransactionID', 'ppp_TransactionID') +
      get('Status') +
      get('productId')
    const expected = createHash('sha256').update(concatenated, 'utf8').digest('hex')

    const a = Buffer.from(provided.toLowerCase(), 'utf8')
    const b = Buffer.from(expected, 'utf8')
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}

/**
 * Map a DMN `Status` to a canonical webhook action. `transactionType`
 * (REFUND / VOID / SETTLE / AUTH / SALE) refines the resource + action.
 */
const STATUS_ACTION: Record<string, WebhookAction> = {
  APPROVED: 'paid',
  SUCCESS: 'paid',
  DECLINED: 'failed',
  ERROR: 'failed',
  PENDING: 'created',
  UPDATE: 'updated',
}

function classify(record: Record<string, unknown>): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const type = field(record, 'transactionType').toUpperCase()
  const status = field(record, 'Status', 'status').toUpperCase()
  const baseAction = STATUS_ACTION[status] ?? 'unknown'

  if (type === 'CREDIT' || type === 'REFUND') {
    return { resourceType: 'refunds', action: status === 'APPROVED' ? 'refunded' : baseAction }
  }
  if (type === 'VOID') {
    return { resourceType: 'charges', action: status === 'APPROVED' ? 'cancelled' : baseAction }
  }
  // SALE / AUTH / SETTLE and everything else map to charges.
  return { resourceType: 'charges', action: baseAction }
}

export function parseNuveiWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const type = field(payload, 'transactionType') || 'dmn'
  const status = field(payload, 'Status', 'status')
  const resourceId = field(
    payload,
    'TransactionID',
    'transactionId',
    'PPP_TransactionID',
    'ppp_TransactionID',
    'clientUniqueId',
  )
  const { resourceType, action } = classify(payload)
  return [
    {
      platform: 'nuvei',
      type: status ? `${type}.${status}`.toLowerCase() : type.toLowerCase(),
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const NuveiWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyNuveiWebhook,
  parseWebhookEvents: parseNuveiWebhookEvents,
}
