import type { Charge, ChargeStatus } from '../../../schema/charge'
import { decimalToMinor, pickCurrency, strMap } from './shared'

export interface RawMPPayment {
  id?: number | string
  status?: string
  transaction_amount?: number
  transaction_amount_refunded?: number
  currency_id?: string
  description?: string
  external_reference?: string
  payer?: { id?: string; email?: string }
  payment_method_id?: string
  date_created?: string
  date_last_updated?: string
  status_detail?: string
  metadata?: Record<string, unknown>
  [k: string]: unknown
}

function mapStatus(raw: RawMPPayment): ChargeStatus {
  switch ((raw.status ?? '').toLowerCase()) {
    case 'approved':
      return 'succeeded'
    case 'pending':
    case 'in_process':
    case 'authorized':
      return 'pending'
    case 'rejected':
      return 'failed'
    case 'refunded':
      return 'refunded'
    case 'cancelled':
    case 'charged_back':
      return raw.status === 'charged_back' ? 'disputed' : 'cancelled'
    default:
      return 'pending'
  }
}

export function transformCharge(raw: RawMPPayment): Charge {
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    amount: decimalToMinor(raw.transaction_amount),
    currency: pickCurrency(raw.currency_id),
    amountRefunded: raw.transaction_amount_refunded
      ? decimalToMinor(raw.transaction_amount_refunded)
      : undefined,
    status: mapStatus(raw),
    customerId: raw.payer?.id,
    receiptEmail: raw.payer?.email,
    description: raw.description,
    failureMessage: raw.status_detail,
    gateway: 'mercado-pago',
    metadata: strMap({
      ...raw.metadata,
      external_reference: raw.external_reference,
      payment_method_id: raw.payment_method_id,
    }),
    createdAt: raw.date_created,
    updatedAt: raw.date_last_updated,
    raw,
  }
}
