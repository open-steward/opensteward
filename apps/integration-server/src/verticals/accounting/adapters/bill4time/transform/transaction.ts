/**
 * Bill4Time → canonical Transaction transform.
 *
 * Bill4Time v2 payment fields (from B4T API documentation):
 *   PaymentId, ClientID, InvoiceId, PaymentDate, Amount, Currency,
 *   PaymentMethod, Notes, DepositedTo (bank account), Reference
 */
import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface Bill4TimePayment {
  PaymentId?: string | number
  ClientID?: string | number
  ClientName?: string
  InvoiceId?: string | number
  InvoiceNumber?: string
  PaymentDate?: string
  Amount?: number
  Currency?: string
  PaymentMethod?: string
  Notes?: string
  Reference?: string
  DepositedTo?: string
  [key: string]: unknown
}

export function transformTransaction(raw: Bill4TimePayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.ClientID != null) {
    contacts.push({ id: String(raw.ClientID), name: raw.ClientName || undefined })
  }

  return {
    id: raw.PaymentId != null ? String(raw.PaymentId) : undefined,
    accountId: raw.DepositedTo || undefined,
    type: 'PAYMENT',
    reference: raw.InvoiceNumber || (raw.InvoiceId != null ? String(raw.InvoiceId) : undefined),
    memo: raw.Notes || undefined,
    paymentMethod: raw.PaymentMethod || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.PaymentDate ? new Date(raw.PaymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
