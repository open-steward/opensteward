import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface IdokladInvoiceLine {
  Id: string | number
  Name?: string
  UnitPrice?: number
  Amount?: number
  TotalWithVat?: number
  VatAmount?: number
  AccountNumber?: string
  [key: string]: unknown
}

export interface IdokladInvoice {
  Id: string | number
  DocumentNumber?: string
  DateOfIssue?: string
  DateOfMaturity?: string
  TotalWithVat?: number
  TotalVat?: number
  DocumentStatus?: number
  PurchaserId?: string | number
  CurrencyId?: string
  IssuedInvoiceItems?: IdokladInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status?: number): InvoiceStatus {
  switch (status) {
    case 3: return 'PAID'
    case 2: return 'AUTHORIZED'
    case 4: return 'VOIDED'
    case 1: default: return 'DRAFT'
  }
}

export function transformInvoice(raw: IdokladInvoice): Invoice {
  return {
    id: String(raw.Id),
    type: 'INVOICE',
    status: mapStatus(raw.DocumentStatus),
    invoiceNumber: raw.DocumentNumber || undefined,
    contactId: raw.PurchaserId ? String(raw.PurchaserId) : undefined,
    currency: raw.CurrencyId || undefined,
    totalAmount: raw.TotalWithVat,
    taxAmount: raw.TotalVat,
    balanceAmount: raw.TotalWithVat,
    postedAt: raw.DateOfIssue ? new Date(raw.DateOfIssue) : undefined,
    dueAt: raw.DateOfMaturity ? new Date(raw.DateOfMaturity) : undefined,
    lineItems: (raw.IssuedInvoiceItems ?? []).map(l => ({
      id: String(l.Id),
      itemDescription: l.Name || undefined,
      unitAmount: l.UnitPrice,
      unitQuantity: l.Amount,
      totalAmount: l.TotalWithVat,
      taxAmount: l.VatAmount,
      accountId: l.AccountNumber ? String(l.AccountNumber) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
