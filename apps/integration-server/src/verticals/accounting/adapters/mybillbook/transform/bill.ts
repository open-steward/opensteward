/**
 * myBillBook → canonical Bill transform.
 *
 * myBillBook purchase bills (supplier invoices) fields (snake_case):
 *   id, bill_number, party_id, party_name, bill_date, due_date,
 *   status ("draft"|"submitted"|"paid"|"partially_paid"|"cancelled"|"overdue"),
 *   currency, total_amount, tax_amount, discount_amount, paid_amount,
 *   balance_amount, reference_number, notes, items[], created_at, updated_at
 *
 * Amounts: myBillBook returns decimal INR (e.g. 1250.00).
 * Canonical amounts are INTEGER MINOR UNITS (paise): multiply by 100 + Math.round.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits } from '../../shared/transform'

export interface MybillbookBillItem {
  id?: string
  item_name?: string
  description?: string
  unit_price?: number
  quantity?: number
  discount?: number
  tax_amount?: number
  total_amount?: number
  [key: string]: unknown
}

export interface MybillbookBill {
  id: string
  bill_number?: string
  party_id?: string
  party_name?: string
  bill_date?: string
  due_date?: string
  status?: string
  currency?: string
  total_amount?: number
  tax_amount?: number
  discount_amount?: number
  paid_amount?: number
  balance_amount?: number
  reference_number?: string
  notes?: string
  items?: MybillbookBillItem[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapStatus(raw: MybillbookBill): BillStatus {
  const s = typeof raw.status === 'string' ? raw.status.toLowerCase() : ''
  if (s === 'draft') return 'DRAFT'
  if (s === 'submitted') return 'SUBMITTED'
  if (s === 'authorized') return 'AUTHORIZED'
  if (s === 'paid') return 'PAID'
  if (s === 'partially_paid') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'cancelled' || s === 'voided') return 'VOIDED'
  return 'DRAFT'
}

function mapLineitem(item: MybillbookBillItem): Lineitem {
  return {
    id: item.id || undefined,
    itemName: item.item_name || undefined,
    itemDescription: item.description || undefined,
    unitAmount: toMinorUnits(item.unit_price),
    unitQuantity: item.quantity !== undefined ? Math.round(item.quantity) : undefined,
    discountAmount: toMinorUnits(item.discount),
    taxAmount: toMinorUnits(item.tax_amount),
    totalAmount: toMinorUnits(item.total_amount),
  }
}

export function transformBill(raw: MybillbookBill): Bill {
  const isoBillDate = toIsoDatetime(raw.bill_date)
  const isoDueDate = toIsoDatetime(raw.due_date)
  const isoCreatedAt = toIsoDatetime(raw.created_at)
  const isoUpdatedAt = toIsoDatetime(raw.updated_at)

  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.bill_number || undefined,
    contactId: raw.party_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: toMinorUnits(raw.total_amount),
    taxAmount: toMinorUnits(raw.tax_amount),
    discountAmount: toMinorUnits(raw.discount_amount),
    paidAmount: toMinorUnits(raw.paid_amount),
    balanceAmount: toMinorUnits(raw.balance_amount),
    notes: raw.notes || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: isoBillDate ? new Date(isoBillDate) : undefined,
    dueAt: isoDueDate ? new Date(isoDueDate) : undefined,
    createdAt: isoCreatedAt ? new Date(isoCreatedAt) : undefined,
    updatedAt: isoUpdatedAt ? new Date(isoUpdatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
