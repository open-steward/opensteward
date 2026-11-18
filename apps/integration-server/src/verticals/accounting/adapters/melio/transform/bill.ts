import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

// Melio bill (AP) — a payable to a vendor
export interface MelioBillLineItem {
  id?: string
  description?: string
  amount: number
  quantity?: number
  unitPrice?: number
  accountId?: string
  [key: string]: unknown
}

export interface MelioBill {
  id: string
  invoiceNumber?: string
  vendorId?: string
  amount: number
  balance?: number
  currency?: string
  status?: string
  invoiceDate?: string
  dueDate?: string
  paidAt?: string
  lineItems?: MelioBillLineItem[]
  notes?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(raw: MelioBill): BillStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'PAID') return 'PAID'
  if (s === 'PARTIALLY_PAID') return 'PARTIALLY_PAID'
  if (s === 'VOIDED' || s === 'CANCELLED') return 'VOIDED'
  if (s === 'DRAFT') return 'DRAFT'
  const balance = raw.balance ?? raw.amount
  if (balance === 0) return 'PAID'
  if (raw.dueDate && new Date(raw.dueDate).getTime() < Date.now()) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapLines(lines: MelioBillLineItem[]): Lineitem[] {
  return (lines ?? []).map((l) => ({
    id: l.id || undefined,
    accountId: l.accountId || undefined,
    itemDescription: l.description || undefined,
    unitAmount: l.unitPrice ?? undefined,
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: l.amount,
  }))
}

export function transformBill(raw: MelioBill): Bill {
  const total = raw.amount
  const balance = raw.balance ?? raw.amount
  const paid = total - balance

  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.vendorId || undefined,
    currency: (raw.currency as Bill['currency']) || undefined,
    totalAmount: total,
    balanceAmount: balance,
    paidAmount: paid > 0 ? paid : undefined,
    notes: raw.notes || undefined,
    lineItems: raw.lineItems ? mapLines(raw.lineItems) : undefined,
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    paidAt: raw.paidAt ? new Date(raw.paidAt) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
