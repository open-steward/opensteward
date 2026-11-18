import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { toMinorUnits } from '../../shared/transform'

export interface CampfireBillLine {
  id?: number | null
  account?: number | null
  account_name?: string | null
  amount?: number | null
  description?: string | null
  tax?: number | null
  currency?: string | null
  [key: string]: unknown
}

export interface CampfireBill {
  id: number
  bill_number?: string | null
  bill_date?: string | null
  due_date?: string | null
  created_at?: string | null
  last_modified_at?: string | null
  voided_date?: string | null
  vendor?: number | null
  vendor_name?: string | null
  entity?: number | null
  currency?: string | null
  total_amount?: number | null
  amount_paid?: number | null
  amount_due?: number | null
  payment_status?: string | null
  lines?: CampfireBillLine[]
  [key: string]: unknown
}

// Campfire bill payment_status values: open, partial, paid, payment_not_found, payment_pending, voided
function mapStatus(raw: CampfireBill): BillStatus {
  const s = (raw.payment_status ?? '').toLowerCase()
  if (s === 'voided') return 'VOIDED'
  if (s === 'paid') return 'PAID'
  if (s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'open') return 'AUTHORIZED'
  if (s === 'payment_pending' || s === 'payment_not_found') return 'SUBMITTED'
  return 'DRAFT'
}

function mapLineitem(line: CampfireBillLine): Lineitem {
  return {
    id: line.id != null ? String(line.id) : undefined,
    accountId: line.account != null ? String(line.account) : undefined,
    itemDescription: line.description || undefined,
    // Campfire amounts are decimal dollars; canonical is integer minor units
    totalAmount: toMinorUnits(line.amount),
    taxAmount: toMinorUnits(line.tax),
  }
}

export function transformBill(raw: CampfireBill): Bill {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId: raw.vendor != null ? String(raw.vendor) : undefined,
    currency: raw.currency || undefined,
    // Campfire amounts are decimal dollars; canonical is integer minor units
    totalAmount: toMinorUnits(raw.total_amount),
    paidAmount: toMinorUnits(raw.amount_paid),
    balanceAmount: toMinorUnits(raw.amount_due),
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    cancelledAt: raw.voided_date ? new Date(raw.voided_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.last_modified_at ? new Date(raw.last_modified_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
