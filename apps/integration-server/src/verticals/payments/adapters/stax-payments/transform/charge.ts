import { majorToMinor, toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { majorNumber, optStr, requiredId } from './shared'

/**
 * A Stax transaction, as GET /transaction lists it and GET /transaction/{id}
 * returns it. Fields from the documented response example:
 * https://docs.staxpayments.com/reference/get-a-transactions-information
 */
export interface RawStaxTransaction {
  id?: string
  type?: string
  reference_id?: string | null
  customer_id?: string | null
  payment_method_id?: string | null
  invoice_id?: string | null
  total?: number | null
  total_refunded?: number | null
  currency?: string | null
  status?: string | null
  message?: string | null
  meta?: unknown
  created_at?: string | null
  updated_at?: string | null
  [k: string]: unknown
}

/**
 * The transaction `status` filter documents "SUCCESS, FAILED, PENDING"
 * (list-and-filter-all-transactions). Anything else is not claimed.
 */
export function mapTransactionStatus(s: unknown): 'succeeded' | 'failed' | 'pending' | 'unknown' {
  if (s === 'SUCCESS') return 'succeeded'
  if (s === 'FAILED') return 'failed'
  if (s === 'PENDING') return 'pending'
  return 'unknown'
}

/**
 * `currency` is the transaction's own documented field. Stax documents it as
 * nullable (the second example on get-a-transactions-information has
 * `"currency": null`), so the caller passes the merchant's currency from
 * GET /self for that case; see `index.ts`.
 */
export function transformCharge(raw: RawStaxTransaction, currency: string): Charge {
  const id = requiredId(raw.id, 'transaction')
  const total = majorNumber(raw.total)
  if (total === undefined) throw new Error(`Stax Payments transaction ${id} has no total`)
  const refunded = majorNumber(raw.total_refunded)
  const status: ChargeStatus = mapTransactionStatus(raw.status)
  return {
    id,
    externalId: id,
    amount: majorToMinor(total, currency),
    currency,
    ...(refunded === undefined ? {} : { amountRefunded: majorToMinor(refunded, currency) }),
    status,
    customerId: optStr(raw.customer_id),
    paymentMethodId: optStr(raw.payment_method_id),
    invoiceId: optStr(raw.invoice_id),
    gateway: 'stax-payments',
    metadata: {},
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at),
    raw,
  }
}
