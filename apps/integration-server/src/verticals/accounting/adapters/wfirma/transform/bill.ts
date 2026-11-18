/**
 * wFirma expenses → canonical Bill.
 *
 * wFirma represents supplier bills / purchase invoices under the `expenses`
 * resource (not a separate "supplier invoices" endpoint).
 * Endpoint: GET /expenses/get/{id}, POST /expenses/find
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import { toMinorUnits } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'

export interface WfirmaExpenseContent {
  id?: number | string
  name?: string
  netto?: number | string
  brutto?: number | string
  vat?: string
  [key: string]: unknown
}

export interface WfirmaExpense {
  id?: number | string
  number?: string
  date?: string          // YYYY-MM-DD — expense date
  paymentdate?: string   // YYYY-MM-DD — due date
  paymentstate?: string  // 'paid' | 'unpaid' | 'undefined'
  paymentmethod?: string
  netto?: number | string
  brutto?: number | string
  tax?: number | string
  paid?: number | string
  remaining?: number | string
  currency?: string
  description?: string
  contractor_id?: number | string
  created?: string
  modified?: string
  expensecontents?: WfirmaExpenseContent[]
  [key: string]: unknown
}

function mapStatus(exp: WfirmaExpense): BillStatus {
  const state = (exp.paymentstate ?? '').toLowerCase()
  if (state === 'paid') return 'PAID'
  if (state === 'unpaid') return 'AUTHORIZED'
  return 'DRAFT'
}

/** Convert a raw upstream timestamp to a Date via toIsoDatetime for safe handling. */
function toDate(v: unknown): Date | undefined {
  const iso = toIsoDatetime(v)
  return iso ? new Date(iso) : undefined
}

export function transformBill(raw: WfirmaExpense): Bill {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    status: mapStatus(raw),
    billNumber: raw.number || undefined,
    contactId: raw.contractor_id !== undefined ? String(raw.contractor_id) : undefined,
    currency: raw.currency || undefined,
    // wFirma emits decimal PLN amounts; canonical Amount requires integer grosz (minor units).
    totalAmount: toMinorUnits(raw.brutto),
    taxAmount: toMinorUnits(raw.tax),
    paidAmount: toMinorUnits(raw.paid),
    balanceAmount: toMinorUnits(raw.remaining),
    notes: raw.description || undefined,
    postedAt: toDate(raw.date),
    dueAt: toDate(raw.paymentdate),
    createdAt: toDate(raw.created),
    updatedAt: toDate(raw.modified),
    metadata: raw as Record<string, unknown>,
  }
}
