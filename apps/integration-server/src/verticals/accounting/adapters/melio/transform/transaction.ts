import type { Transaction, TransactionContact } from '../../../schema/transaction'

// Melio payment (an outgoing/incoming payment transaction)
export interface MelioPayment {
  id: string
  billId?: string
  invoiceId?: string
  vendorId?: string
  customerId?: string
  amount: number
  currency?: string
  status?: string
  paymentMethod?: string
  fundingSourceId?: string
  scheduledDate?: string
  deliveryDate?: string
  deliveredAt?: string
  note?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export function transformPayment(raw: MelioPayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.vendorId) contacts.push({ id: raw.vendorId })
  if (raw.customerId) contacts.push({ id: raw.customerId })

  return {
    id: raw.id,
    type: 'PAYMENT',
    reference: raw.billId ?? raw.invoiceId ?? undefined,
    memo: raw.note || undefined,
    paymentMethod: raw.paymentMethod || undefined,
    currency: (raw.currency as Transaction['currency']) || undefined,
    totalAmount: raw.amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
