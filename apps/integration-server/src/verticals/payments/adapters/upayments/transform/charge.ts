import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'

/**
 * One row of GET /reports/sales, `data.report[]`
 * (https://developers.upayments.com/reference/sales-report.md). Only the
 * fields the transform reads are typed; the documented row also carries
 * customer, products, address, discounts, charges and deposit fields.
 */
export interface RawUpaymentsSalesRow {
  order_id?: string
  track_id?: string
  transaction_id?: string
  /** e.g. "2025-08-28T09:39:45.000000Z" */
  date?: string
  /** Major units as a decimal string, e.g. "0.010" */
  grand_total?: string
  currency?: string
  amount_paid?: string
  refunded_amount?: string | null
  [k: string]: unknown
}

/**
 * `data.transaction` of GET /get-payment-status/{track_id}
 * (https://developers.upayments.com/reference/checkpaymentstatus.md).
 */
export interface RawUpaymentsTransaction {
  order_id?: string
  payment_id?: string
  /** Gateway result, e.g. "CAPTURED" */
  result?: string | null
  payment_type?: string
  track_id?: string
  /** Major units as a decimal string, e.g. "20.000" */
  total_price?: string
  currency_type?: string
  [k: string]: unknown
}

function requireString(v: unknown, field: string): string {
  if (typeof v !== 'string' || v === '') {
    throw new Error(`UPayments response has no ${field}`)
  }
  return v
}

function money(value: unknown, currency: string): number | undefined {
  if (value === null || value === undefined || value === '') return undefined
  return majorToMinor(Number(value), currency)
}

function requireAmount(value: unknown, currency: string, field: string): number {
  const amount = money(value, currency)
  if (amount === undefined) throw new Error(`UPayments response has no numeric ${field}`)
  return amount
}

function stringMeta(fields: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === 'string' && v !== '') out[k] = v
  }
  return out
}

/**
 * A Sales Report row. The row documents no status field, so the status is
 * 'unknown' rather than a guess from the amounts. The id is `track_id`, the
 * key GET /get-payment-status/{track_id} reads back.
 */
export function transformSalesRow(raw: RawUpaymentsSalesRow): Charge {
  const id = requireString(raw.track_id, 'track_id')
  const currency = requireString(raw.currency, 'currency').toUpperCase()
  const refunded = money(raw.refunded_amount, currency)
  return {
    id,
    externalId: id,
    amount: requireAmount(raw.grand_total, currency, 'grand_total'),
    currency,
    ...(refunded !== undefined ? { amountRefunded: refunded } : {}),
    status: 'unknown',
    gateway: 'upayments',
    metadata: stringMeta({ order_id: raw.order_id, transaction_id: raw.transaction_id }),
    createdAt: toIsoDatetime(raw.date),
    raw,
  }
}

/**
 * https://developers.upayments.com/reference/possible-gateway-responses.md,
 * "Transaction Status Overview". A NULL result is "Processing": "Do not treat
 * it as a failure".
 */
function mapResult(result: string | null | undefined): ChargeStatus {
  if (result === null || result === undefined) return 'pending'
  switch (result.toUpperCase()) {
    case 'CAPTURED':
      return 'succeeded'
    case 'AUTHORIZED':
    case 'APPROVED':
    case 'PENDING':
      return 'pending'
    case 'NOT CAPTURED':
    case 'FAILED':
    case 'ERROR':
      return 'failed'
    case 'CANCELED':
    case 'VOIDED':
      return 'cancelled'
    case 'REFUND':
      return 'refunded'
    default:
      return 'unknown'
  }
}

/**
 * A Get Payment Status transaction. `created_at` / `transaction_date`
 * ("2024-05-05 13:14:01") carry no documented time zone, so createdAt is
 * left unset rather than guessed.
 */
export function transformTransaction(raw: RawUpaymentsTransaction): Charge {
  const id = requireString(raw.track_id, 'track_id')
  const currency = requireString(raw.currency_type, 'currency_type').toUpperCase()
  const status = mapResult(raw.result)
  return {
    id,
    externalId: id,
    amount: requireAmount(raw.total_price, currency, 'total_price'),
    currency,
    status,
    ...(status === 'succeeded' ? { captured: true } : {}),
    gateway: 'upayments',
    metadata: stringMeta({
      order_id: raw.order_id,
      payment_id: raw.payment_id,
      payment_type: raw.payment_type,
    }),
    raw,
  }
}
