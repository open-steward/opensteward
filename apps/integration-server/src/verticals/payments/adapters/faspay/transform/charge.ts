import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toAmount, toIsoDatetime } from './shared'

/**
 * A Faspay transaction, returned by the Post Data (`/cvr/100001/10`) and
 * Inquiry of Payment Status (`/cvr/100004/10`) endpoints. Faspay has no
 * first-class customer or refund resource — the customer is identified inline
 * by `bill_no` / `trx_id`, and a refund surfaces as a `payment_status_code` of
 * `4` (reversal) on the transaction itself.
 *
 * `payment_status_code` (string of a single digit):
 *   0 = Unprocessed    1 = In Process    2 = Payment Success
 *   3 = Payment Failed 4 = Payment Reversal
 *   5 = No bills found 7 = Payment Expired
 *   8 = Payment Cancelled  9 = Unknown
 *
 * Money is whole-rupiah IDR integers carried as strings (`bill_total: "100000"`),
 * which equals the canonical integer minor-unit amount for IDR.
 *
 * Docs: https://docs.faspay.co.id/merchant-integration/api-reference-1/debit-transaction/inquiry-payment-status
 */
export interface RawFaspayTransaction {
  response?: string
  trx_id?: string
  merchant_id?: string
  merchant?: string
  bill_no?: string
  bill_reff?: string
  bill_desc?: string
  bill_currency?: string
  bill_total?: string
  payment_total?: string
  payment_reff?: string
  payment_date?: string
  payment_status_code?: string
  payment_status_desc?: string
  payment_channel_uid?: string
  payment_channel?: string
  redirect_url?: string
  response_code?: string
  response_desc?: string
  cust_no?: string
  cust_name?: string
  [k: string]: unknown
}

/** Map a Faspay `payment_status_code` onto the canonical {@link ChargeStatus}. */
function mapStatus(raw: RawFaspayTransaction): ChargeStatus {
  switch ((raw.payment_status_code ?? '').trim()) {
    case '2':
      return 'succeeded'
    case '0':
    case '1':
    case '9':
      return 'pending'
    case '3':
    case '5':
      return 'failed'
    case '4':
      return 'refunded'
    case '7':
    case '8':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawFaspayTransaction): Charge {
  const id = String(raw.trx_id ?? raw.bill_no ?? '')
  const code = (raw.payment_status_code ?? '').trim()
  const failed = code === '3' || code === '5'
  return {
    id,
    externalId: id,
    amount: toAmount(raw.bill_total ?? raw.payment_total) ?? 0,
    currency: pickCurrency(raw.bill_currency),
    status: mapStatus(raw),
    description: raw.bill_desc,
    failureCode: failed ? raw.payment_status_code : undefined,
    failureMessage: failed ? raw.payment_status_desc : undefined,
    gateway: 'faspay',
    metadata: strMap({
      bill_no: raw.bill_no,
      bill_reff: raw.bill_reff,
      merchant: raw.merchant,
      payment_reff: raw.payment_reff,
      payment_status_code: raw.payment_status_code,
      payment_status_desc: raw.payment_status_desc,
      payment_channel_uid: raw.payment_channel_uid,
      payment_channel: raw.payment_channel,
      cust_no: raw.cust_no,
      cust_name: raw.cust_name,
    }),
    createdAt: toIsoDatetime(raw.payment_date),
    updatedAt: toIsoDatetime(raw.payment_date),
    raw,
  }
}
