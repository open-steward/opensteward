import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface NiboInvoiceItem {
  itemId: number
  productCode: string
  description: string
  unitPrice: number
  quantity: number
  totalValue: number
  taxValue: number
  accountCode: string
  discountValue: number
  [key: string]: unknown
}

export interface NiboInvoice {
  invoiceId: number
  documentNumber: string
  customerId: number
  customerName: string
  issueDate: string
  dueDate: string
  totalValue: number
  taxValue: number
  balance: number
  paidValue: number
  currencyCode: string
  status: string
  isCancelled: boolean
  items: NiboInvoiceItem[]
  reference: string
  [key: string]: unknown
}

function mapStatus(inv: NiboInvoice): InvoiceStatus {
  if (inv.isCancelled) return 'VOIDED'
  if (inv.status === 'Paid' || inv.balance === 0) return 'PAID'
  if (inv.balance > 0 && inv.balance < inv.totalValue) return 'PARTIALLY_PAID'
  if (inv.status === 'Authorized') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(row: NiboInvoiceItem): Lineitem {
  return {
    id: String(row.itemId),
    accountId: row.accountCode || undefined,
    itemId: row.productCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalValue,
    taxAmount: row.taxValue,
    discountAmount: row.discountValue || undefined,
  }
}

export function transformInvoice(raw: NiboInvoice): Invoice {
  return {
    id: String(raw.invoiceId),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.documentNumber || undefined,
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalValue,
    taxAmount: raw.taxValue,
    balanceAmount: raw.balance,
    paidAmount: raw.paidValue || undefined,
    reference: raw.reference || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customerId: invoice.contactId ? Number(invoice.contactId) : undefined,
    currencyCode: invoice.currency,
    issueDate: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    reference: invoice.reference,
    items: invoice.lineItems?.map((li) => ({
      productCode: li.itemId,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountCode: li.accountId,
    })),
  }
}
