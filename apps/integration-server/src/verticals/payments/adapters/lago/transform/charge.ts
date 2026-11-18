/**
 * Lago Payment ↔ canonical Charge.
 *
 * Lago has no card-acquiring layer. The closest equivalent to a canonical
 * "charge" is Lago's **Payment** object: a recorded settlement of one or more
 * invoices, carrying `amount_cents`, `amount_currency`, `payment_status`, and
 * links to the customer and invoice(s). We map this onto the canonical `Charge`
 * schema:
 *
 *   lago Payment.lago_id          → Charge.id / externalId
 *   lago Payment.amount_cents     → Charge.amount
 *   lago Payment.amount_currency  → Charge.currency
 *   lago Payment.payment_status   → Charge.status (succeeded/failed/pending)
 *   lago Payment.lago_customer_id → Charge.customerId
 *   lago Payment.invoice_ids[0]   → Charge.invoiceId
 *
 * List endpoint:   GET /payments
 * Single endpoint: GET /payments/{lago_id}
 *
 * Docs: https://docs.getlago.com/api-reference/payments/payment-object
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency } from './shared'

export interface RawLagoPayment {
  lago_id?: string
  lago_customer_id?: string | null
  external_customer_id?: string | null
  invoice_ids?: string[] | null
  invoice_numbers?: string[] | null
  amount_cents?: number
  amount_currency?: string | null
  payment_status?: string | null
  type?: string | null
  payment_provider_type?: string | null
  provider_payment_id?: string | null
  created_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawLagoPayment): ChargeStatus {
  switch ((raw.payment_status ?? '').toLowerCase()) {
    case 'succeeded':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'pending':
    case 'processing':
      return 'pending'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawLagoPayment): Charge {
  const id = String(raw.lago_id ?? '')
  const status = mapStatus(raw)
  const amount = raw.amount_cents ?? 0
  return {
    id,
    externalId: raw.provider_payment_id ?? id,
    amount,
    currency: pickCurrency(raw.amount_currency) ?? 'USD',
    status,
    captured: status === 'succeeded',
    amountCaptured: status === 'succeeded' ? amount : 0,
    amountRefunded: 0,
    customerId: raw.external_customer_id ?? raw.lago_customer_id ?? undefined,
    invoiceId: raw.invoice_ids?.[0] ?? undefined,
    gateway: 'lago',
    metadata: {
      ...(raw.payment_provider_type ? { payment_provider_type: raw.payment_provider_type } : {}),
      ...(raw.type ? { type: raw.type } : {}),
    },
    createdAt: toIsoDatetime(raw.created_at),
    raw,
  }
}
