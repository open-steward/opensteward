import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface DineroProductLine {
  Guid: string
  ProductGuid: string
  Description: string
  Quantity: number
  AccountNumber: number
  Unit: string
  BaseAmountValue: number
  TotalAmount: number
  VatAmount: number
  [key: string]: unknown
}

export interface DineroInvoice {
  Guid: string
  Number: number
  ContactGuid: string
  Currency: string
  Date: string
  PaymentDate: string
  TotalInclVat: number
  TotalVat: number
  RemainingAmount: number
  PaymentAmount: number
  Status: 'Draft' | 'Booked' | 'Paid' | 'PartPayment' | 'Overdue' | 'Voided'
  ProductLines: DineroProductLine[]
  [key: string]: unknown
}

function mapStatus(status: DineroInvoice['Status']): InvoiceStatus {
  switch (status) {
    case 'Draft':
      return 'DRAFT'
    case 'Booked':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'PartPayment':
      return 'PARTIALLY_PAID'
    case 'Overdue':
      return 'OVERDUE'
    case 'Voided':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: DineroProductLine): Lineitem {
  return {
    id: line.Guid || undefined,
    accountId: line.AccountNumber ? String(line.AccountNumber) : undefined,
    itemId: line.ProductGuid || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.BaseAmountValue,
    unitQuantity: line.Quantity,
    totalAmount: line.TotalAmount,
    taxAmount: line.VatAmount,
  }
}

export function transformInvoice(raw: DineroInvoice): Invoice {
  return {
    id: raw.Guid,
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.Number != null ? String(raw.Number) : undefined,
    contactId: raw.ContactGuid || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.TotalInclVat,
    taxAmount: raw.TotalVat,
    balanceAmount: raw.RemainingAmount,
    paidAmount: raw.PaymentAmount || undefined,
    lineItems: (raw.ProductLines ?? []).map(mapLineitem),
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.PaymentDate ? new Date(raw.PaymentDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
