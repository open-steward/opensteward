import type { Transaction, TransactionContact } from '../../../schema/transaction'
import type { TransactionLineitem } from '../../../schema/shared'

export interface VismaLedgerItem {
  Id: string
  CustomerId: string
  CustomerNumber: string
  SupplierId: string
  SupplierNumber: string
  InvoiceId: string
  InvoiceNumber: number
  Amount: number
  RemainingAmount: number
  CurrencyCode: string
  PaymentDate: string
  DueDate: string
  AccountNumber: number
  Description: string
  VoucherNumber: string
  CreatedUtc: string
  ModifiedUtc: string
  [key: string]: unknown
}

function mapLineitems(raw: VismaLedgerItem): TransactionLineitem[] {
  return [
    {
      accountId: raw.AccountNumber ? String(raw.AccountNumber) : undefined,
      description: raw.Description || undefined,
      totalAmount: raw.Amount,
    },
  ]
}

export function transformTransaction(raw: VismaLedgerItem): Transaction {
  const contacts: TransactionContact[] = []
  if (raw.CustomerId) {
    contacts.push({ id: raw.CustomerId, name: raw.CustomerNumber || undefined })
  }
  if (raw.SupplierId) {
    contacts.push({ id: raw.SupplierId, name: raw.SupplierNumber || undefined })
  }

  return {
    id: raw.Id,
    accountId: raw.AccountNumber ? String(raw.AccountNumber) : undefined,
    reference: raw.InvoiceNumber ? String(raw.InvoiceNumber) : raw.VoucherNumber || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.Amount,
    contacts: contacts.length > 0 ? contacts : undefined,
    lineItems: mapLineitems(raw),
    createdAt: raw.PaymentDate ? new Date(raw.PaymentDate) : raw.CreatedUtc ? new Date(raw.CreatedUtc) : undefined,
    updatedAt: raw.ModifiedUtc ? new Date(raw.ModifiedUtc) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
