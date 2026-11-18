import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface QBOSalesItemLineDetail {
  UnitPrice: number
  Qty: number
  ItemRef: { value: string; name: string }
}

export interface QBOLine {
  Id: string
  LineNum: number
  Description: string
  Amount: number
  DetailType: string
  SalesItemLineDetail?: QBOSalesItemLineDetail
}

export interface QBOInvoice {
  Id: string
  DocNumber: string
  CustomerRef: { value: string; name: string }
  TxnDate: string
  DueDate: string
  TotalAmt: number
  Balance: number
  CurrencyRef: { value: string; name: string }
  Line: QBOLine[]
  sparse?: boolean
  [key: string]: unknown
}

function mapStatus(inv: QBOInvoice): InvoiceStatus {
  if (inv.Balance === 0) return 'PAID'
  if (inv.Balance < inv.TotalAmt) return 'PARTIALLY_PAID'
  const now = Date.now()
  if (inv.DueDate && new Date(inv.DueDate).getTime() < now) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapLines(lines: QBOLine[]): Lineitem[] {
  return (lines ?? [])
    .filter((l) => l.DetailType === 'SalesItemLineDetail')
    .map((l) => ({
      id: l.Id || undefined,
      itemId: l.SalesItemLineDetail?.ItemRef?.value || undefined,
      itemDescription: l.Description || undefined,
      unitAmount: l.SalesItemLineDetail?.UnitPrice,
      unitQuantity: l.SalesItemLineDetail?.Qty,
      totalAmount: l.Amount,
    }))
}

export function transformInvoice(raw: QBOInvoice): Invoice {
  return {
    id: raw.Id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.DocNumber || undefined,
    contactId: raw.CustomerRef?.value || undefined,
    currency: raw.CurrencyRef?.value || undefined,
    totalAmount: raw.TotalAmt,
    balanceAmount: raw.Balance,
    paidAmount: raw.TotalAmt - raw.Balance || undefined,
    lineItems: mapLines(raw.Line ?? []),
    postedAt: raw.TxnDate ? new Date(raw.TxnDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    CustomerRef: invoice.contactId ? { value: invoice.contactId } : undefined,
    CurrencyRef: invoice.currency ? { value: invoice.currency } : undefined,
    TxnDate: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    DocNumber: invoice.invoiceNumber,
    Line: invoice.lineItems?.map((li, i) => ({
      LineNum: i + 1,
      Description: li.itemDescription,
      Amount: li.totalAmount,
      DetailType: 'SalesItemLineDetail',
      SalesItemLineDetail: {
        UnitPrice: li.unitAmount,
        Qty: li.unitQuantity,
        ItemRef: li.itemId ? { value: li.itemId } : { value: '1' },
      },
    })),
  }
}
