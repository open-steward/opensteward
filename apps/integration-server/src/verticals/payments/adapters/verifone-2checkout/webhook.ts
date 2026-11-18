/**
 * 2Checkout (Verifone) IPN (Instant Payment Notification) verification +
 * event parsing.
 *
 * 2Checkout POSTs IPNs as `application/x-www-form-urlencoded`. The signature is
 * an HMAC over the concatenation of `LEN(value) + value` for every POSTed
 * parameter — *excluding* the signature/hash fields themselves — in the order
 * received, where `LEN` is the UTF-8 **byte** length and empty values
 * contribute `0` (no value appended). The HMAC key is the merchant Secret Key.
 *
 * The current signature ships in the `SIGNATURE_SHA2_256` field (HMAC-SHA256);
 * `SIGNATURE_SHA3_256` (HMAC-SHA3-256) is the alternative. The legacy `HASH`
 * (MD5) field is deprecated and not accepted here.
 *
 * Docs: https://docs.2checkout.com/2checkout-apis/2checkout-apis/webhooks
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

const SIGNATURE_FIELDS = ['SIGNATURE_SHA2_256', 'SIGNATURE_SHA3_256', 'HASH'] as const

const ALGO_BY_FIELD: Record<string, string> = {
  SIGNATURE_SHA2_256: 'sha256',
  SIGNATURE_SHA3_256: 'sha3-256',
}

/**
 * Serialise an IPN parameter value into the byte-length-prefixed form 2Checkout
 * signs over. Arrays (e.g. `IPN_PID[]`) contribute each element in order.
 */
function expand(value: unknown): string {
  if (Array.isArray(value)) return value.map(expand).join('')
  const str = value === null || value === undefined ? '' : String(value)
  if (str.length === 0) return '0'
  return `${Buffer.byteLength(str, 'utf8')}${str}`
}

/** Build the source string from every field except the signature fields. */
function buildSourceString(fields: Record<string, unknown>): string {
  let out = ''
  for (const [key, value] of Object.entries(fields)) {
    if ((SIGNATURE_FIELDS as readonly string[]).includes(key)) continue
    out += expand(value)
  }
  return out
}

export function verifyVerifone2checkoutWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const params = new URLSearchParams(payload.toString('utf8'))
    const fields: Record<string, unknown> = {}
    for (const [k, v] of params.entries()) {
      // URLSearchParams yields repeated keys (e.g. IPN_PID[]) individually;
      // collapse them into an array so `expand` reproduces the signed order.
      const existing = fields[k]
      if (existing === undefined) fields[k] = v
      else if (Array.isArray(existing)) existing.push(v)
      else fields[k] = [existing, v]
    }

    for (const field of SIGNATURE_FIELDS) {
      const algo = ALGO_BY_FIELD[field]
      if (!algo) continue // skip the deprecated MD5 `HASH` field
      const provided = params.get(field)
      if (!provided) continue
      const expected = createHmac(algo, secret)
        .update(buildSourceString(fields), 'utf8')
        .digest('hex')
      const a = Buffer.from(provided.toLowerCase(), 'hex')
      const b = Buffer.from(expected, 'hex')
      if (a.length === b.length && timingSafeEqual(a, b)) return true
    }
    return false
  } catch {
    return false
  }
}

const STATUS_ACTION_MAP: Record<string, WebhookAction> = {
  COMPLETE: 'paid',
  AUTHRECEIVED: 'paid',
  PENDING: 'created',
  PENDINGAPPROVAL: 'created',
  REFUND: 'refunded',
  CANCELED: 'cancelled',
  CANCELLED: 'cancelled',
  REVERSED: 'cancelled',
  INVALID: 'failed',
  CHARGEBACK: 'disputed',
}

function classify(orderStatus: string): { resourceType: WebhookResourceType; action: WebhookAction } {
  return {
    resourceType: 'charges',
    action: STATUS_ACTION_MAP[orderStatus.toUpperCase()] ?? 'unknown',
  }
}

export function parseVerifone2checkoutWebhookEvents(
  payload: Record<string, unknown>,
): WebhookEvent[] {
  const orderStatus = String(payload['ORDERSTATUS'] ?? '')
  const resourceId = String(payload['REFNO'] ?? payload['ORDERNO'] ?? '')
  const { resourceType, action } = classify(orderStatus)
  return [
    {
      platform: 'verifone-2checkout',
      type: orderStatus ? `order.${orderStatus.toLowerCase()}` : 'order',
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const Verifone2checkoutWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyVerifone2checkoutWebhook,
  parseWebhookEvents: parseVerifone2checkoutWebhookEvents,
}
