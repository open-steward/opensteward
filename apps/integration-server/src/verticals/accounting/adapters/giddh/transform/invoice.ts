import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface GiddhVoucherEntryTax {
  uniqueName: string
  percent: number
  [key: string]: unknown
}

export interface GiddhVoucherEntry {
  uniqueName: string
  description: string
  quantity: number
  rate: number
  amount: number
  taxableAmount: number
  accountUniqueName: string
  accountName: string
  taxes: GiddhVoucherEntryTax[]
  [key: string]: unknown
}

export interface GiddhVoucherAccount {
  uniqueName: string
  name: string
  [key: string]: unknown
}

export interface GiddhVoucher {
  uniqueName: string
  number: string
  voucherDate: string
  dueDate: string
  grandTotal: number
  taxesTotal: number
  subTotal: number
  balanceDue: number
  currency: string
  account: GiddhVoucherAccount
  entries: GiddhVoucherEntry[]
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status?.toLowerCase()) {
    case 'pending':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'draft':
      return 'DRAFT'
    case 'cancel':
      return 'VOIDED'
    case 'partial':
      return 'PARTIALLY_PAID'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(entry: GiddhVoucherEntry): Lineitem {
  const taxAmount = entry.taxes?.reduce((sum, t) => {
    return sum + (entry.taxableAmount * t.percent) / 100
  }, 0)

  return {
    accountId: entry.accountUniqueName || undefined,
    itemDescription: entry.description || undefined,
    unitAmount: entry.rate,
    unitQuantity: entry.quantity,
    totalAmount: entry.amount,
    taxAmount: taxAmount || undefined,
  }
}

export function transformInvoice(raw: GiddhVoucher): Invoice {
  return {
    id: raw.uniqueName,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.number || undefined,
    contactId: raw.account?.uniqueName || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grandTotal,
    taxAmount: raw.taxesTotal || undefined,
    balanceAmount: raw.balanceDue || undefined,
    lineItems: (raw.entries ?? []).map(mapLineitem),
    postedAt: raw.voucherDate ? new Date(raw.voucherDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
