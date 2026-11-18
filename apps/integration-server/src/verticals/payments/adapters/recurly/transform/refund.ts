/**
 * Recurly refund → canonical Refund.
 *
 * Recurly surfaces refunds as Transaction objects with `type = 'refund'`.
 * The shape is identical to RawRecurlyTransaction; we re-declare the
 * relevant fields here for clarity and forward-compatibility.
 */
import type { Refund, RefundStatus } from '../../../schema/refund'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawRecurlyRefund {
  id?: string
  uuid?: string
  type?: string
  status?: string
  amount?: number
  currency?: string
  account?: { id?: string }
  invoice?: { id?: string }
  /** original charge / payment transaction this refund is against */
  original_transaction_id?: string
  payment_method?: { gateway_code?: string }
  gateway_transaction_id?: string
  refunded_at?: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

function mapStatus(raw: RawRecurlyRefund): RefundStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'success':
    case 'succeeded':
      return 'succeeded'
    case 'failed':
    case 'declined':
    case 'error':
      return 'failed'
    case 'voided':
      return 'cancelled'
    default:
      return 'pending'
  }
}

export function transformRefund(raw: RawRecurlyRefund): Refund {
  return {
    id: String(raw.id ?? raw.uuid ?? ''),
    externalId: String(raw.uuid ?? raw.id ?? ''),
    chargeId: String(raw.original_transaction_id ?? raw.invoice?.id ?? ''),
    amount: decimalToMinor(raw.amount),
    currency: pickCurrency(raw.currency),
    status: mapStatus(raw),
    gateway: 'recurly',
    metadata: strMap({
      processor: raw.payment_method?.gateway_code,
      gateway_transaction_id: raw.gateway_transaction_id,
      account_id: raw.account?.id,
      invoice_id: raw.invoice?.id,
    }),
    createdAt: raw.refunded_at ?? raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
