/**
 * MRI Software — Bill (AP Invoice) transform.
 *
 * MRI represents payable invoices as "Bills" under the AP module.
 * Status is derived from the `status` field returned by the API.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface MriBillLine {
  id: string
  description?: string
  accountId?: string
  itemId?: string
  unitAmount?: number
  quantity?: number
  taxAmount?: number
  totalAmount?: number
  [key: string]: unknown
}

export interface MriBill {
  id: string
  billNumber?: string
  vendorId?: string
  currencyCode?: string
  status?: string
  totalAmount?: number
  taxAmount?: number
  discountAmount?: number
  paidAmount?: number
  balanceAmount?: number
  invoiceDate?: string
  dueDate?: string
  paidDate?: string
  notes?: string
  lines?: MriBillLine[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PAID':
    case 'CLOSED':
      return 'PAID'
    case 'PARTIAL':
    case 'PARTIALLY_PAID':
      return 'PARTIALLY_PAID'
    case 'OVERDUE':
      return 'OVERDUE'
    case 'VOID':
    case 'VOIDED':
      return 'VOIDED'
    case 'DELETED':
      return 'DELETED'
    case 'DRAFT':
    case 'PENDING':
      return 'DRAFT'
    case 'SUBMITTED':
      return 'SUBMITTED'
    case 'OPEN':
    case 'AUTHORIZED':
    default:
      return 'AUTHORIZED'
  }
}

function mapLineitem(line: MriBillLine): Lineitem {
  return {
    id: line.id || undefined,
    accountId: line.accountId || undefined,
    itemId: line.itemId || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unitAmount,
    unitQuantity: line.quantity,
    taxAmount: line.taxAmount,
    totalAmount: line.totalAmount,
  }
}

export function transformBill(raw: MriBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.billNumber || undefined,
    contactId: raw.vendorId || undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount ?? undefined,
    discountAmount: raw.discountAmount ?? undefined,
    paidAmount: raw.paidAmount ?? undefined,
    balanceAmount: raw.balanceAmount ?? undefined,
    notes: raw.notes || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    paidAt: raw.paidDate ? new Date(raw.paidDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
