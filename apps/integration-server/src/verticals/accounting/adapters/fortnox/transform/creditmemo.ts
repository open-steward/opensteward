import type { CreditMemo, CreditMemoStatus } from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits, fromMinorUnits, prefixedId, unprefixedId, toCalendarDate } from '../../shared/transform'

export interface FortnoxCreditInvoiceRow {
  RowId: number
  ArticleNumber: string
  Description: string
  Price: number
  OrderedQuantity: number
  Total: number
  VAT: number
  AccountNumber: string
  Discount: number
}

export interface FortnoxCreditInvoice {
  DocumentNumber: string
  CustomerNumber: string
  CustomerName: string
  InvoiceDate: string
  DueDate: string
  Total: number
  TotalVAT: number
  Balance: number
  Currency: string
  Booked: boolean
  Cancelled: boolean
  PaidAmount: number
  InvoiceRows: FortnoxCreditInvoiceRow[]
  [key: string]: unknown
}

function mapStatus(cm: FortnoxCreditInvoice): CreditMemoStatus {
  if (cm.Cancelled) return 'VOIDED'
  if (cm.Booked && cm.Balance === 0) return 'PAID'
  if (cm.Booked && cm.Balance > 0 && cm.Balance < Math.abs(cm.Total)) return 'PARTIALLY_PAID'
  if (cm.Booked) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: FortnoxCreditInvoiceRow): Lineitem {
  return {
    id: String(row.RowId),
    accountId: row.AccountNumber || undefined,
    itemId: row.ArticleNumber || undefined,
    itemDescription: row.Description || undefined,
    unitAmount: toMinorUnits(row.Price),
    unitQuantity: row.OrderedQuantity,
    totalAmount: toMinorUnits(row.Total),
    taxAmount: toMinorUnits(row.VAT),
    discountAmount: toMinorUnits(row.Discount) || undefined,
  }
}

export function transformCreditMemo(raw: FortnoxCreditInvoice): CreditMemo {
  return {
    id: raw.DocumentNumber,
    status: mapStatus(raw),
    creditmemoNumber: raw.DocumentNumber,
    contactId: prefixedId('cust', raw.CustomerNumber),
    currency: raw.Currency || undefined,
    totalAmount: toMinorUnits(raw.Total),
    taxAmount: toMinorUnits(raw.TotalVAT),
    balanceAmount: toMinorUnits(raw.Balance),
    paidAmount: toMinorUnits(raw.PaidAmount) || undefined,
    lineItems: raw.InvoiceRows ? raw.InvoiceRows.map(mapLineitem) : null,
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// Canonical CreditMemo → Fortnox body (for create)
export function untransformCreditMemo(cm: Partial<CreditMemo>): Record<string, unknown> {
  return {
    CustomerNumber: unprefixedId('cust', cm.contactId),
    Currency: cm.currency,
    InvoiceDate: toCalendarDate(cm.postedAt),
    DueDate: toCalendarDate(cm.dueAt),
    InvoiceRows: cm.lineItems?.map((li) => ({
      ArticleNumber: li.itemId,
      Description: li.itemDescription,
      Price: fromMinorUnits(li.unitAmount),
      OrderedQuantity: li.unitQuantity,
      AccountNumber: li.accountId,
    })),
  }
}
