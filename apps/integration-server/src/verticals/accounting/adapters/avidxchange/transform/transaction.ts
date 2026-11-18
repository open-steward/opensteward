/**
 * AvidXchange payment transform → canonical Transaction.
 *
 * AvidXchange payments represent outgoing AP payments to vendors.
 *
 * Key payment fields (camelCase on the wire):
 *   paymentId, invoiceId, vendorId, vendorName, companyId,
 *   paymentMethod, paymentDate, amount, currency, status,
 *   checkNumber, remittanceInfo, createdDate, modifiedDate
 */
import type { Transaction, TransactionContact } from '../../../schema/transaction'

export interface AvidXchangePayment {
  paymentId: string
  invoiceId?: string
  vendorId?: string
  vendorName?: string
  companyId?: string
  paymentMethod?: string
  paymentDate?: string
  amount?: number
  currency?: string
  status?: string
  checkNumber?: string
  remittanceInfo?: string
  glAccountId?: string
  glAccountCode?: string
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

export function transformTransaction(raw: AvidXchangePayment): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.vendorId) {
    contacts.push({ id: raw.vendorId, name: raw.vendorName || undefined })
  }

  return {
    id: raw.paymentId,
    accountId: raw.glAccountId || raw.glAccountCode || undefined,
    type: raw.paymentMethod || undefined,
    reference: raw.invoiceId || raw.checkNumber || undefined,
    memo: raw.remittanceInfo || undefined,
    paymentMethod: raw.paymentMethod || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    createdAt: raw.paymentDate
      ? new Date(raw.paymentDate)
      : raw.createdDate
        ? new Date(raw.createdDate)
        : undefined,
    updatedAt: raw.modifiedDate ? new Date(raw.modifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
