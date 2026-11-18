import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface UnimicroLineItem {
  ID?: number
  ProductName?: string
  NumberOfItems?: number
  PriceExVat?: number
  SumTotalExVat?: number
  SumVat?: number
  Account?: string
  [key: string]: unknown
}

export interface UnimicroInvoice {
  ID?: number
  InvoiceNumber?: string
  InvoiceDate?: string
  PaymentDueDate?: string
  TaxExclusiveAmount?: number
  TaxAmount?: number
  TaxInclusiveAmount?: number
  RestAmount?: number
  StatusCode?: number
  CurrencyCode?: string
  CustomerID?: number
  Items?: UnimicroLineItem[]
  [key: string]: unknown
}

function mapStatus(statusCode?: number): InvoiceStatus {
  switch (statusCode) {
    case 10:
      return 'DRAFT'
    case 30:
      return 'AUTHORIZED'
    case 50:
      return 'PAID'
    case 40:
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: UnimicroLineItem): Lineitem {
  return {
    id: item.ID !== undefined ? String(item.ID) : undefined,
    accountId: item.Account || undefined,
    itemDescription: item.ProductName || undefined,
    unitAmount: item.PriceExVat,
    unitQuantity: item.NumberOfItems,
    totalAmount: item.SumTotalExVat,
    taxAmount: item.SumVat,
  }
}

export function transformInvoice(raw: UnimicroInvoice): Invoice {
  return {
    id: String(raw.ID ?? ''),
    type: 'INVOICE',
    status: mapStatus(raw.StatusCode),
    invoiceNumber: raw.InvoiceNumber || undefined,
    contactId: raw.CustomerID !== undefined ? String(raw.CustomerID) : undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.TaxInclusiveAmount,
    taxAmount: raw.TaxAmount,
    balanceAmount: raw.RestAmount,
    lineItems: (raw.Items ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.PaymentDueDate ? new Date(raw.PaymentDueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    CustomerID: invoice.contactId ? Number(invoice.contactId) : undefined,
    CurrencyCode: invoice.currency,
    InvoiceDate: toCalendarDate(invoice.postedAt),
    PaymentDueDate: toCalendarDate(invoice.dueAt),
    Items: invoice.lineItems?.map((li) => ({
      ProductName: li.itemDescription,
      NumberOfItems: li.unitQuantity,
      PriceExVat: li.unitAmount,
      Account: li.accountId,
    })),
  }
}
