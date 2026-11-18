/**
 * Paytm posts the payment/refund status to the merchant's callback (webhook)
 * URL as an `application/x-www-form-urlencoded` body of UPPERCASE fields:
 *   ORDERID, MID, TXNID, TXNAMOUNT, PAYMENTMODE, CURRENCY, TXNDATE, STATUS,
 *   RESPCODE, RESPMSG, GATEWAYNAME, BANKTXNID, BANKNAME, REFUNDAMT, CHECKSUMHASH
 *
 * Integrity is the same Paytm checksum scheme used for API signing (AES-128-CBC
 * + SHA-256 + salt, keyed with the Merchant Key). The `CHECKSUMHASH` field is
 * itself excluded from the recomputed signature; every other field
 * participates. We verify against the PARSED form fields rather than the raw
 * body because the checksum is computed over the field values, not the wire
 * bytes.
 *
 * `STATUS` is one of `TXN_SUCCESS`, `TXN_FAILURE`, `PENDING`.
 *
 * Docs: https://business.paytm.com/docs/payment-status/
 *       https://business.paytm.com/docs/checksum/
 */
import type { WebhookHandler } from '@opensteward/shared'
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'
import { verifySignature } from './checksum'

/** Map a Paytm `STATUS` to the canonical webhook action. */
const ACTION_MAP: Record<string, WebhookAction> = {
  TXN_SUCCESS: 'succeeded',
  TXN_FAILURE: 'failed',
  PENDING: 'created',
  REFUND_SUCCESS: 'refunded',
}

/** Parse a form-urlencoded callback/webhook body into its field map. */
function parseFormBody(payload: Buffer): Record<string, string> {
  const params = new URLSearchParams(payload.toString('utf8'))
  const out: Record<string, string> = {}
  for (const [k, v] of params.entries()) out[k] = v
  return out
}

/**
 * Verify a Paytm callback/webhook. The signed params are every posted field
 * except `CHECKSUMHASH`; `secret` is the Merchant Key.
 */
export function verifyPaytmWebhook(
  payload: Buffer,
  _headers: Record<string, string>,
  secret: string,
): boolean {
  try {
    const fields = parseFormBody(payload)
    const checksum = fields['CHECKSUMHASH'] ?? fields['checksumhash'] ?? ''
    if (!checksum) return false
    const { CHECKSUMHASH: _c, checksumhash: _c2, ...rest } = fields
    return verifySignature(rest, secret, checksum)
  } catch {
    return false
  }
}

/** Classify a Paytm callback payload into resource + action. */
function classify(fields: Record<string, unknown>): {
  resourceType: WebhookResourceType
  action: WebhookAction
} {
  const isRefund = fields['REFUNDAMT'] != null && fields['STATUS'] == null
  const status = String(fields['STATUS'] ?? '').toUpperCase()
  return {
    resourceType: isRefund ? 'refunds' : 'charges',
    action: ACTION_MAP[status] ?? 'unknown',
  }
}

export function parsePaytmWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const status = String(payload['STATUS'] ?? '')
  const { resourceType, action } = classify(payload)
  const resourceId = String(payload['ORDERID'] ?? payload['TXNID'] ?? '')
  return [
    {
      platform: 'paytm',
      type: status || 'PAYTM_CALLBACK',
      resourceType,
      action,
      resourceId,
      payload,
    },
  ]
}

export const PaytmWebhookHandler: WebhookHandler = {
  verifyWebhook: verifyPaytmWebhook,
  parseWebhookEvents: parsePaytmWebhookEvents,
}
