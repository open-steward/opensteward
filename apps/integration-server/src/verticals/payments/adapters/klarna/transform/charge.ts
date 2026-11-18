/**
 * Klarna `Order` maps to canonical `Charge`. The Klarna order carries
 * installment schedule + invoicing terms in its raw payload; the
 * canonical surface only exposes the principal (Charge.amount). Consumers
 * who need installments must drop down to `raw`.
 */
import { requireAmount } from '@opensteward/shared'

import type { Charge, ChargeStatus } from '../../../schema/charge'
import { pickCurrency, strMap } from './shared'

export interface RawKlarnaOrder {
  order_id?: string
  status?: string
  order_amount?: number
  refunded_amount?: number
  captured_amount?: number
  purchase_currency?: string
  customer?: { date_of_birth?: string }
  billing_address?: { email?: string; given_name?: string; family_name?: string }
  merchant_reference1?: string
  merchant_reference2?: string
  klarna_reference?: string
  initial_payment_method?: { type?: string }
  start_date?: string
  last_modified_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawKlarnaOrder): ChargeStatus {
  switch ((raw.status ?? '').toUpperCase()) {
    case 'AUTHORIZED':
      return 'pending'
    case 'PART_CAPTURED':
      return 'partially_refunded' // partial capture; canonical schema lacks a dedicated state, surface as partial
    case 'CAPTURED':
      return 'succeeded'
    case 'CANCELLED':
      return 'cancelled'
    case 'EXPIRED':
      return 'failed'
    case 'CLOSED':
      return raw.refunded_amount && raw.refunded_amount > 0 ? 'refunded' : 'succeeded'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawKlarnaOrder): Charge {
  const name = [raw.billing_address?.given_name, raw.billing_address?.family_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  return {
    id: String(raw.order_id ?? ''),
    externalId: String(raw.order_id ?? ''),
    amount: requireAmount(raw.order_amount, 'klarna charge'),
    currency: pickCurrency(raw.purchase_currency),
    amountRefunded: raw.refunded_amount,
    amountCaptured: raw.captured_amount,
    status: mapStatus(raw),
    receiptEmail: raw.billing_address?.email,
    description: name || undefined,
    gateway: 'klarna',
    metadata: strMap({
      merchant_reference1: raw.merchant_reference1,
      merchant_reference2: raw.merchant_reference2,
      klarna_reference: raw.klarna_reference,
      initial_payment_method: raw.initial_payment_method?.type,
    }),
    createdAt: raw.start_date,
    updatedAt: raw.last_modified_at,
    raw,
  }
}
