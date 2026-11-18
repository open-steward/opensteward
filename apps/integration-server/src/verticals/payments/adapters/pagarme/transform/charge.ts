/**
 * Pagar.me v5 is order-centric but exposes **charges** as a first-class,
 * listable/gettable resource (`/charges`, `/charges/{id}`) — a charge carries
 * the amount, currency, payment status, customer and the underlying
 * `last_transaction`. That maps cleanly onto the canonical **Charge**.
 *
 * An **Order** (`/orders`) groups one or more charges; we surface an order by
 * folding its charges into canonical Charges via `transformOrderCharges`, so
 * both `/orders` and `/charges` land on the same canonical shape.
 *
 * Money is in centavos (minor units). Timestamps are ISO-8601 strings and are
 * normalised with `toIsoDatetime`.
 *
 * Refs:
 *   https://docs.pagar.me/reference/obter-cobrança
 *   https://docs.pagar.me/reference/obter-pedido
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawPagarmeLastTransaction {
  id?: string
  transaction_type?: string
  gateway_id?: string
  status?: string
  success?: boolean
  acquirer_message?: string
  acquirer_return_code?: string
  operation_type?: string
  [k: string]: unknown
}

export interface RawPagarmeChargeCustomer {
  id?: string
  name?: string
  email?: string
  [k: string]: unknown
}

export interface RawPagarmeCharge {
  id?: string
  code?: string
  gateway_id?: string
  amount?: number
  paid_amount?: number
  status?: string
  currency?: string
  payment_method?: string
  order?: { id?: string; [k: string]: unknown }
  customer?: RawPagarmeChargeCustomer
  invoice?: { id?: string; [k: string]: unknown }
  last_transaction?: RawPagarmeLastTransaction
  created_at?: string
  updated_at?: string
  paid_at?: string
  canceled_at?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

/** An Order groups charges; we read its `charges[]` to derive canonical Charges. */
export interface RawPagarmeOrder {
  id?: string
  code?: string
  amount?: number
  currency?: string
  status?: string
  customer?: RawPagarmeChargeCustomer
  charges?: RawPagarmeCharge[]
  created_at?: string
  updated_at?: string
  closed?: boolean
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

/**
 * Pagar.me charge `status` values: `pending`, `paid`, `canceled`,
 * `processing`, `failed`, `overpaid`, `underpaid`, plus `chargedback` when a
 * dispute is opened. `partial_canceled` appears after a partial refund.
 */
function mapStatus(raw: RawPagarmeCharge): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'paid':
    case 'overpaid':
    case 'underpaid':
      return 'succeeded'
    case 'partial_canceled':
      return 'partially_refunded'
    case 'canceled':
      return 'cancelled'
    case 'chargedback':
      return 'disputed'
    case 'failed':
      return 'failed'
    case 'pending':
    case 'processing':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawPagarmeCharge): Charge {
  const status = (raw.status ?? '').toLowerCase()
  const lastTx = raw.last_transaction
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.code ?? raw.id ?? ''),
    amount: raw.amount ?? 0,
    currency: pickCurrency(raw.currency),
    amountCaptured: raw.paid_amount ?? undefined,
    status: mapStatus(raw),
    captured: status === 'paid' || status === 'overpaid' || status === 'underpaid' ? true : undefined,
    customerId: raw.customer?.id ? String(raw.customer.id) : undefined,
    receiptEmail: raw.customer?.email ?? undefined,
    invoiceId: raw.invoice?.id ? String(raw.invoice.id) : undefined,
    paymentMethodId: lastTx?.id ? String(lastTx.id) : undefined,
    failureMessage:
      lastTx && lastTx.success === false ? lastTx.acquirer_message ?? undefined : undefined,
    failureCode:
      lastTx && lastTx.success === false ? lastTx.acquirer_return_code ?? undefined : undefined,
    gateway: 'pagarme',
    metadata: strMap({
      ...raw.metadata,
      gateway_id: raw.gateway_id,
      payment_method: raw.payment_method,
      order_id: raw.order?.id,
    }),
    createdAt: toIsoDatetime(raw.created_at),
    updatedAt: toIsoDatetime(raw.updated_at ?? raw.paid_at ?? raw.canceled_at),
    raw,
  }
}

/**
 * Flatten a Pagar.me Order into canonical Charges. Each entry in the order's
 * `charges[]` becomes a Charge; the order's id/currency/customer backfill any
 * field the nested charge omits. Returns an empty array when the order has no
 * charges (never throws).
 */
export function transformOrderCharges(order: RawPagarmeOrder): Charge[] {
  const charges = order.charges ?? []
  return charges.map((c) =>
    transformCharge({
      ...c,
      currency: c.currency ?? order.currency,
      customer: c.customer ?? order.customer,
      order: c.order ?? { id: order.id },
    }),
  )
}
