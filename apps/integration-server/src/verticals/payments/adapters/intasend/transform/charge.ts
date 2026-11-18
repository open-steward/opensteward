/**
 * IntaSend is invoice-centric: a collection request creates an **invoice**
 * that carries the amount, currency, payer account and payment `state`, so it
 * maps onto the canonical **Charge**. The `/payment/status/` poll returns the
 * invoice plus a `meta` block (customer + payment-link); we surface the
 * customer email/id from there when present.
 *
 * Money is a decimal string in major units (`value`, e.g. `"10.36"`) and is
 * scaled to minor units. Timestamps are ISO-8601 with a timezone offset and
 * are re-normalised through `toIsoDatetime`.
 *
 * Refs:
 *   https://developers.intasend.com/docs/payment-status
 *   payment-collection/collection-api.md (IntaSend/documentation)
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawIntasendInvoice {
  id?: number | string
  invoice_id?: string
  state?: string
  provider?: string
  charges?: string
  net_amount?: number | string
  currency?: string
  value?: string | number
  account?: string
  api_ref?: string | null
  host?: string | null
  failed_reason?: string | null
  failed_code?: string | null
  failed_code_link?: string | null
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export interface RawIntasendCustomerMeta {
  id?: number | string
  phone_number?: string
  email?: string
  first_name?: string | null
  last_name?: string | null
  [k: string]: unknown
}

export interface RawIntasendPaymentStatus {
  invoice?: RawIntasendInvoice
  meta?: {
    id?: string
    customer?: RawIntasendCustomerMeta
    [k: string]: unknown
  }
  /** Some collection responses nest invoice + customer at the top level. */
  customer?: RawIntasendCustomerMeta
  id?: string
  [k: string]: unknown
}

/**
 * Invoice `state` values: PENDING, PROCESSING, COMPLETE / COMPLETED, FAILED.
 * (Webhook payloads use COMPLETED; status polls use COMPLETE — accept both.)
 */
function mapStatus(state: string | undefined): ChargeStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'COMPLETE':
    case 'COMPLETED':
      return 'succeeded'
    case 'FAILED':
      return 'failed'
    case 'PENDING':
    case 'PROCESSING':
      return 'pending'
    default:
      return 'pending'
  }
}

/**
 * Normalise the many shapes IntaSend returns a charge in:
 *  - `/payment/status/` → `{ invoice, meta: { customer } }`
 *  - collection / wallet funding → `{ id, invoice, customer }`
 *  - webhook collection event → the bare invoice object
 */
export function transformCharge(raw: RawIntasendPaymentStatus | RawIntasendInvoice): Charge {
  const wrapped = raw as RawIntasendPaymentStatus
  const invoice: RawIntasendInvoice =
    wrapped.invoice ?? (raw as RawIntasendInvoice)
  const customer = wrapped.meta?.customer ?? wrapped.customer

  const id = String(invoice.invoice_id ?? invoice.id ?? '')
  const state = (invoice.state ?? '').toUpperCase()

  return {
    id,
    externalId: id,
    amount: toMinorUnits(invoice.value ?? invoice.net_amount) ?? 0,
    currency: pickCurrency(invoice.currency),
    status: mapStatus(invoice.state),
    captured: state === 'COMPLETE' || state === 'COMPLETED' ? true : undefined,
    customerId:
      customer?.id != null && customer.id !== '' ? String(customer.id) : undefined,
    receiptEmail: customer?.email ?? (isEmail(invoice.account) ? invoice.account : undefined),
    failureCode: invoice.failed_code ?? undefined,
    failureMessage: invoice.failed_reason ?? undefined,
    gateway: 'intasend',
    metadata: strMap({
      provider: invoice.provider,
      api_ref: invoice.api_ref,
      charges: invoice.charges,
    }),
    createdAt: toIsoDatetime(invoice.created_at),
    updatedAt: toIsoDatetime(invoice.updated_at),
    raw,
  }
}

function isEmail(v: unknown): v is string {
  return typeof v === 'string' && v.includes('@')
}
