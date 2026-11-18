import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { nonempty } from '../../shared/transform'
import type { SystimaLineItem } from './invoice'

export interface SystimaBill {
  id: string
  invoiceNumber?: string
  date?: string
  dueDate?: string
  amountExVat?: number
  vatAmount?: number
  amountIncVat?: number
  unpaidAmount?: number
  status?: string
  currency?: string
  supplierId?: string
  lines?: SystimaLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: SystimaBill): BillStatus {
  switch (raw.status?.toUpperCase()) {
    case 'RECEIVED':
      return 'AUTHORIZED'
    case 'PAID':
      return 'PAID'
    case 'CANCELLED':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(row: SystimaLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.accountNumber || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.vatAmount || undefined,
  }
}

export function transformBill(raw: SystimaBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.amountIncVat,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.unpaidAmount,
    lineItems: nonempty((raw.lines ?? []).map(mapLineitem)),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
