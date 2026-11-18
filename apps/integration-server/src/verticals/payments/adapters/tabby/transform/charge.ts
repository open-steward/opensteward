/**
 * A Tabby **payment** (`GET /api/v2/payments/{id}`) carries the amount,
 * currency, buyer, order, and the authorize → capture → refund lifecycle, so
 * it maps onto the canonical **Charge**.
 *
 * Money is a decimal string in the major unit (e.g. `"330.00"`); we convert to
 * integer minor units via the currency exponent (see ./shared). `captures[]`
 * and `refunds[]` are read-only sub-arrays — we sum them for `amountCaptured`
 * / `amountRefunded` and derive the canonical status from the payment status
 * plus how much has been captured / refunded.
 *
 * Tabby payment statuses: CREATED, AUTHORIZED, CLOSED, REJECTED, EXPIRED. The
 * v2 list endpoint additionally filters on `captured`, `refunded`,
 * `cancelled`. There is no buyer id (the buyer is embedded, contact-only), so
 * `customerId` is left unset.
 *
 * Docs:
 *   https://docs.tabby.ai/api-reference/payments/retrieve-a-payment
 *   https://docs.tabby.ai/api-reference/payments/list-of-all-payments
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap, toMinorUnits } from './shared'

export interface RawTabbyBuyer {
  name?: string
  email?: string
  phone?: string
  dob?: string
  [k: string]: unknown
}

export interface RawTabbyOrder {
  reference_id?: string
  updated_at?: string
  tax_amount?: string
  shipping_amount?: string
  discount_amount?: string
  items?: unknown[]
  [k: string]: unknown
}

export interface RawTabbyCapture {
  id?: string
  created_at?: string
  amount?: string
  reference_id?: string
  [k: string]: unknown
}

export interface RawTabbyRefundEntry {
  id?: string
  created_at?: string
  amount?: string
  reason?: string
  reference_id?: string
  [k: string]: unknown
}

export interface RawTabbyPayment {
  id?: string
  status?: string
  is_test?: boolean
  amount?: string
  currency?: string
  description?: string | null
  created_at?: string
  expires_at?: string
  buyer?: RawTabbyBuyer
  order?: RawTabbyOrder
  captures?: RawTabbyCapture[]
  refunds?: RawTabbyRefundEntry[]
  meta?: Record<string, unknown> | null
  [k: string]: unknown
}

/** Sum a list of decimal-string amounts into minor units for one currency. */
function sumMinor(
  list: Array<{ amount?: string }> | undefined,
  currency: string | null | undefined,
): number {
  return (list ?? []).reduce((acc, e) => acc + (toMinorUnits(e.amount, currency) ?? 0), 0)
}

function mapStatus(raw: RawTabbyPayment, total: number, captured: number, refunded: number): ChargeStatus {
  const status = (raw.status ?? '').toUpperCase()

  if (refunded > 0) {
    return total > 0 && refunded < total ? 'partially_refunded' : 'refunded'
  }
  switch (status) {
    case 'REFUNDED':
      return 'refunded'
    case 'CAPTURED':
    case 'CLOSED':
      return 'succeeded'
    case 'REJECTED':
    case 'EXPIRED':
      return 'failed'
    case 'CANCELLED':
      return 'cancelled'
    case 'AUTHORIZED':
      // Authorized + partially captured is still in-flight on Tabby's side.
      return captured > 0 ? 'succeeded' : 'pending'
    case 'CREATED':
    case 'NEW':
      return 'pending'
    default:
      return captured > 0 ? 'succeeded' : 'pending'
  }
}

export function transformCharge(raw: RawTabbyPayment): Charge {
  const currency = pickCurrency(raw.currency)
  const total = toMinorUnits(raw.amount, currency) ?? 0
  const captured = sumMinor(raw.captures, currency)
  const refunded = sumMinor(raw.refunds, currency)

  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: total,
    currency,
    amountCaptured: captured > 0 ? captured : undefined,
    amountRefunded: refunded > 0 ? refunded : undefined,
    status: mapStatus(raw, total, captured, refunded),
    captured: captured > 0 ? true : undefined,
    receiptEmail: raw.buyer?.email ?? undefined,
    description: raw.description ?? undefined,
    refundIds: raw.refunds?.map((r) => String(r.id ?? '')).filter(Boolean),
    gateway: 'tabby',
    metadata: strMap({
      ...raw.meta,
      tabby_status: raw.status,
      is_test: raw.is_test,
      reference_id: raw.order?.reference_id,
      buyer_name: raw.buyer?.name,
      buyer_phone: raw.buyer?.phone,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.order?.updated_at ?? raw.created_at),
    raw,
  }
}
