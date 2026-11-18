import type { Refund, RefundStatus } from '../../../schema/refund'
import { decimalToMinor, parseNmiDatetime, pickCurrency, strMap } from './shared'

/**
 * NMI processes a refund through the Payment API (`type=refund`), which echoes
 * a new `transactionid` plus the immediate `response`. The originating charge
 * is the `transactionid` passed in the request, so we carry it through as
 * `chargeId` from the call site.
 */
export interface RawNmiRefund {
  transactionId?: string
  chargeId?: string
  response?: string
  responseText?: string
  responseCode?: string
  authCode?: string
  amount?: string
  currency?: string
  date?: string
  raw?: unknown
}

function mapStatus(raw: RawNmiRefund): RefundStatus {
  const resp = (raw.response ?? '').trim()
  if (resp === '1') return 'succeeded'
  if (resp === '2' || resp === '3') return 'failed'
  return 'pending'
}

export function transformRefund(raw: RawNmiRefund): Refund {
  return {
    id: String(raw.transactionId ?? ''),
    externalId: String(raw.transactionId ?? ''),
    chargeId: String(raw.chargeId ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    failureReason:
      (raw.response ?? '') !== '1' ? raw.responseText || undefined : undefined,
    gateway: 'nmi',
    metadata: strMap({
      response_code: raw.responseCode,
      auth_code: raw.authCode,
    }),
    createdAt: parseNmiDatetime(raw.date),
    raw: raw.raw ?? raw,
  }
}

/** Decode a Payment API (transact.php) refund response into `RawNmiRefund`. */
export function refundFromTransactResponse(
  res: Record<string, string>,
  context: { chargeId: string; amount?: number; currency?: string },
): RawNmiRefund {
  return {
    transactionId: res.transactionid,
    chargeId: context.chargeId,
    response: res.response,
    responseText: res.responsetext,
    responseCode: res.response_code,
    authCode: res.authcode,
    amount:
      res.amount ?? (context.amount !== undefined ? (context.amount / 100).toFixed(2) : undefined),
    currency: res.currency ?? context.currency,
    raw: res,
  }
}
