import type { Bill, BillStatus } from '../../../schema/bill'

export interface NetSuiteBill {
  id?: string | number
  tranId?: string
  entity?: string | number
  total?: number
  taxTotal?: number
  amountRemaining?: number
  tranDate?: string
  dueDate?: string
  currency?: string
  status?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined): BillStatus {
  const s = (status ?? '').toLowerCase()
  if (s.includes('paid in full') || s.includes('paid')) return 'PAID'
  if (s.includes('cancelled') || s.includes('voided')) return 'VOIDED'
  if (s.includes('open') || s.includes('posted')) return 'AUTHORIZED'
  return 'DRAFT'
}

export function transformBill(raw: NetSuiteBill): Bill {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    billNumber: raw.tranId || undefined,
    contactId: raw.entity !== undefined ? String(raw.entity) : undefined,
    status: mapStatus(raw.status),
    totalAmount: raw.total,
    taxAmount: raw.taxTotal,
    balanceAmount: raw.amountRemaining,
    currency: raw.currency || undefined,
    postedAt: raw.tranDate ? new Date(raw.tranDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
