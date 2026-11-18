/**
 * DualEntry payment → canonical Transaction.
 *
 * DualEntry exposes payments at GET /public/v2/payments/.
 * A payment represents cash received against an invoice or bill.
 */
import type { Transaction } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

export interface DualentryPayment {
  id: number
  date: string | null
  transaction_date: string | null
  company_id: number | null
  contact_id: number | null
  contact_name: string | null
  account_id: number | null
  currency_iso_4217_code: string | null
  amount: string
  memo: string | null
  reference_number: string | null
  payment_method: string | null
  payment_type: string | null   // 'incoming' | 'outgoing'
  record_status: string | null
  [key: string]: unknown
}

function mapType(raw: DualentryPayment): string | undefined {
  if (!raw.payment_type) return undefined
  const t = raw.payment_type.toLowerCase()
  if (t.includes('out')) return 'PAYMENT_OUT'
  if (t.includes('in')) return 'PAYMENT_IN'
  return 'PAYMENT'
}

function buildLineitems(raw: DualentryPayment): TransactionLineitem[] {
  return [
    {
      accountId: raw.account_id != null ? String(raw.account_id) : undefined,
      description: raw.memo || undefined,
      totalAmount: toMinorUnits(raw.amount),
    },
  ]
}

export function transformTransaction(raw: DualentryPayment): Transaction {
  const contactEntry =
    raw.contact_id != null
      ? [{ id: String(raw.contact_id), name: raw.contact_name || undefined }]
      : undefined

  return {
    id: String(raw.id),
    accountId: raw.account_id != null ? String(raw.account_id) : undefined,
    type: mapType(raw),
    reference: raw.reference_number || undefined,
    memo: raw.memo || undefined,
    paymentMethod: raw.payment_method || undefined,
    currency: raw.currency_iso_4217_code || undefined,
    totalAmount: toMinorUnits(raw.amount),
    contacts: contactEntry,
    lineItems: buildLineitems(raw),
    createdAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
