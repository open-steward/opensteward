import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, pickStr, strMap, toMinorUnits } from './shared'

/**
 * A Tingg "request" (collection) — the closest analogue to a canonical
 * Charge. Returned by the query-status endpoint and echoed (in part) by the
 * checkout-request response. Field names are snake_case on the wire.
 *
 * `request_status_code` is the lifecycle marker:
 *   178 → full payment received        (succeeded)
 *   176 → partial payment, closed       (pending — not fully settled)
 *   177 → partial payment, still open   (pending)
 *   101 → created                       (pending)
 *   102 → pending                       (pending)
 *   179 → expired with partial payment  (failed; reversals initiated upstream)
 *   129 → expired, no payment           (failed)
 *    99 → a failed payment attempt      (failed)
 */
export interface RawCellulantRequest {
  checkout_request_id?: string | number
  merchant_transaction_id?: string
  service_code?: string
  account_number?: string
  request_amount?: string | number
  original_request_amount?: string | number
  amount_paid?: string | number
  currency_code?: string
  request_currency_code?: string
  request_status_code?: number | string
  request_status_description?: string
  request_description?: string
  msisdn?: string
  customer_first_name?: string
  customer_last_name?: string
  customer_email?: string
  country_code?: string
  country_abbrv?: string
  date_created?: string
  date_modified?: string
  payments?: Array<{
    payer_transaction_id?: string
    payment_status?: string | number
    date_payment_received?: string
    [k: string]: unknown
  }>
  failed_payments?: Array<Record<string, unknown>>
  [k: string]: unknown
}

function mapStatus(code: number | string | undefined): ChargeStatus {
  switch (Number(code)) {
    case 178: // full payment received
      return 'succeeded'
    case 176: // partial payment, marked closed
    case 177: // partial payment, still open
    case 101: // created
    case 102: // pending
      return 'pending'
    case 179: // expired with partial payment (reversals initiated)
    case 129: // expired, no payment
    case 99: // failed payment attempt
      return 'failed'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawCellulantRequest): Charge {
  const id = String(raw.checkout_request_id ?? raw.merchant_transaction_id ?? '')
  const firstPayment = raw.payments?.[0]
  const name = [raw.customer_first_name, raw.customer_last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  const status = mapStatus(raw.request_status_code)
  return {
    id,
    externalId: pickStr(raw.merchant_transaction_id) ?? id,
    amount: toMinorUnits(raw.request_amount ?? raw.original_request_amount),
    currency: pickCurrency(raw.currency_code ?? raw.request_currency_code),
    amountCaptured: raw.amount_paid != null ? toMinorUnits(raw.amount_paid) : undefined,
    status,
    customerId: pickStr(raw.account_number),
    receiptEmail: pickStr(raw.customer_email),
    description: pickStr(raw.request_description),
    failureMessage:
      status === 'failed' ? pickStr(raw.request_status_description) : undefined,
    gateway: 'cellulant',
    metadata: strMap({
      service_code: raw.service_code,
      account_number: raw.account_number,
      msisdn: raw.msisdn,
      country_code: raw.country_code ?? raw.country_abbrv,
      customer_name: name || undefined,
      request_status_code: raw.request_status_code,
      request_status_description: raw.request_status_description,
      payer_transaction_id: firstPayment?.payer_transaction_id,
    }),
    createdAt: toIsoDatetime(raw.date_created),
    updatedAt: toIsoDatetime(
      raw.date_modified ?? firstPayment?.date_payment_received ?? raw.date_created,
    ),
    raw,
  }
}

/**
 * Build a Tingg checkout-request body from a partial canonical Charge.
 * Amount is converted minor → major (Tingg expects major units). The caller
 * supplies merchant/service identifiers via `metadata` (service_code,
 * account_number) and the redirect/callback URLs.
 */
export function untransformCharge(c: Partial<Charge>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (c.externalId !== undefined) out.merchant_transaction_id = c.externalId
  if (c.amount !== undefined) out.request_amount = (c.amount / 100).toFixed(2)
  if (c.currency !== undefined) out.currency_code = c.currency.toUpperCase()
  if (c.customerId !== undefined) out.account_number = c.customerId
  if (c.receiptEmail !== undefined) out.customer_email = c.receiptEmail
  if (c.description !== undefined) out.request_description = c.description
  const md = c.metadata ?? {}
  if (md.service_code) out.service_code = md.service_code
  if (md.account_number) out.account_number = out.account_number ?? md.account_number
  if (md.msisdn) out.msisdn = md.msisdn
  if (md.country_code) out.country_code = md.country_code
  if (md.callback_url) out.callback_url = md.callback_url
  if (md.success_redirect_url) out.success_redirect_url = md.success_redirect_url
  if (md.fail_redirect_url) out.fail_redirect_url = md.fail_redirect_url
  if (md.customer_first_name) out.customer_first_name = md.customer_first_name
  if (md.customer_last_name) out.customer_last_name = md.customer_last_name
  return out
}

/**
 * The checkout-request response carries a `results` block with the
 * platform-assigned `checkout_request_id` and hosted-page URLs. Fold these
 * into a charge so the create response surfaces the new id + receipt URL.
 */
export interface RawCellulantCheckoutResponse {
  status?: { status_code?: number | string; status_description?: string }
  results?: {
    checkout_request_id?: string | number
    merchant_transaction_id?: string
    short_url?: string
    long_url?: string
    [k: string]: unknown
  }
  [k: string]: unknown
}

export function transformCheckoutResponse(
  res: RawCellulantCheckoutResponse,
  submitted: Partial<Charge>,
): Charge {
  const results = res.results ?? {}
  const id = String(
    results.checkout_request_id ??
      results.merchant_transaction_id ??
      submitted.externalId ??
      '',
  )
  return {
    id,
    externalId:
      pickStr(results.merchant_transaction_id) ?? pickStr(submitted.externalId) ?? id,
    amount: submitted.amount ?? 0,
    currency: pickCurrency(submitted.currency),
    status: 'pending',
    customerId: pickStr(submitted.customerId),
    receiptEmail: pickStr(submitted.receiptEmail),
    description: pickStr(submitted.description),
    receiptUrl: pickStr(results.short_url ?? results.long_url),
    gateway: 'cellulant',
    metadata: strMap({
      status_code: res.status?.status_code,
      status_description: res.status?.status_description,
      short_url: results.short_url,
      long_url: results.long_url,
    }),
    raw: res,
  }
}
