import type { Transaction } from '../../../schema/transaction'

export interface ErpNextPaymentEntry {
  name: string
  posting_date: string
  payment_type: string
  paid_amount: number
  paid_from_account_currency: string
  party: string
  remarks: string
  [key: string]: unknown
}

function mapType(paymentType: string): string {
  if (paymentType === 'Pay') return 'DEBIT'
  if (paymentType === 'Receive') return 'CREDIT'
  return 'DEBIT'
}

export function transformTransaction(raw: ErpNextPaymentEntry): Transaction {
  return {
    id: raw.name,
    type: mapType(raw.payment_type),
    totalAmount: raw.paid_amount,
    currency: raw.paid_from_account_currency || undefined,
    contacts: raw.party ? [{ id: raw.party }] : undefined,
    memo: raw.remarks || undefined,
    createdAt: raw.posting_date ? new Date(raw.posting_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
