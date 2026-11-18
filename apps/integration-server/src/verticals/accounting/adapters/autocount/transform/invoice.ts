import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface AutocountDetailItem {
  Seq: number
  ItemCode: string
  Description: string
  Qty: number
  UnitPrice: number
  Amount: number
  TaxAmt: number
  TaxCode: string
  AccNo: string
  [key: string]: unknown
}

export interface AutocountInvoice {
  DocNo: string
  DocDate: string
  PostDate: string
  DueDate: string
  SubTotal: number
  TaxAmt: number
  DocAmt: number
  CreditBalance: number
  DebtorCode: string
  DebtorName: string
  CurrencyCode: string
  Description: string
  Cancelled: boolean
  Posted: boolean
  DetailItems: AutocountDetailItem[]
  [key: string]: unknown
}

function mapStatus(inv: AutocountInvoice): InvoiceStatus {
  if (inv.Cancelled) return 'VOIDED'
  if (inv.Posted && inv.CreditBalance === 0) return 'PAID'
  if (inv.Posted && inv.CreditBalance > 0 && inv.CreditBalance < inv.DocAmt) return 'PARTIALLY_PAID'
  if (inv.Posted) return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(item: AutocountDetailItem): Lineitem {
  return {
    id: String(item.Seq),
    accountId: item.AccNo || undefined,
    itemId: item.ItemCode || undefined,
    itemDescription: item.Description || undefined,
    unitAmount: item.UnitPrice,
    unitQuantity: item.Qty,
    totalAmount: item.Amount,
    taxAmount: item.TaxAmt || undefined,
    taxrateId: item.TaxCode || undefined,
  }
}

export function transformInvoice(raw: AutocountInvoice): Invoice {
  return {
    id: raw.DocNo,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.DocNo,
    contactId: raw.DebtorCode || undefined,
    currency: raw.CurrencyCode || undefined,
    totalAmount: raw.DocAmt,
    taxAmount: raw.TaxAmt,
    balanceAmount: raw.CreditBalance,
    notes: raw.Description || undefined,
    lineItems: (raw.DetailItems ?? []).map(mapLineitem),
    postedAt: raw.DocDate ? new Date(raw.DocDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
