/**
 * Transform Routable Payable → canonical Bill.
 *
 * In Routable, a "payable" is an outbound payment to a vendor (accounts
 * payable), which maps to the canonical Bill type.
 *
 * Docs: https://developers.routable.com/docs/payables-1
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { RoutableLineItem } from './invoice'

// ── Routable types ────────────────────────────────────────────────────────────

export interface RoutablePayable {
  id: string
  status?: string          // needs_approval | ready_to_send | scheduled | pending | processing | initiated | issue | failed | canceled | externally_paid | completed
  bill_number?: string
  amount?: string | number
  amount_due?: string | number
  amount_paid?: string | number
  currency_code?: string
  company?: string | { id?: string; display_name?: string; [key: string]: unknown }
  line_items?: RoutableLineItem[]
  created_at?: string
  due_on?: string          // date (YYYY-MM-DD)
  issued_on?: string       // date (YYYY-MM-DD)
  send_on?: string
  reference?: string
  external_id?: string
  message?: string
  terms?: string
  type?: string            // ach | check | international | external | vendor_choice
  version?: number
  [key: string]: unknown
}

// ── Status map ────────────────────────────────────────────────────────────────

function mapStatus(status?: string): BillStatus {
  switch (status) {
    case 'needs_approval':
    case 'ready_to_send':
    case 'scheduled':
      return 'AUTHORIZED'
    case 'pending':
    case 'processing':
    case 'initiated':
      return 'SUBMITTED'
    case 'completed':
    case 'externally_paid':
      return 'PAID'
    case 'issue':
    case 'failed':
      return 'OVERDUE'
    case 'canceled':
      return 'VOIDED'
    default:
      return 'DRAFT'
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(val?: string | number | null): number | undefined {
  if (val === undefined || val === null) return undefined
  const n = typeof val === 'number' ? val : parseFloat(val as string)
  return isNaN(n) ? undefined : Math.round(n * 100)
}

function companyId(company?: RoutablePayable['company']): string | undefined {
  if (!company) return undefined
  if (typeof company === 'string') return company
  return company.id || undefined
}

function mapLineitem(li: RoutableLineItem): Lineitem {
  return {
    id: li.id || undefined,
    itemDescription: li.description || undefined,
    unitAmount: parseAmount(li.unit_price),
    unitQuantity: li.quantity ?? undefined,
    totalAmount: parseAmount(li.amount),
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformBill(raw: RoutablePayable): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.bill_number || undefined,
    contactId: companyId(raw.company),
    currency: raw.currency_code || undefined,
    totalAmount: parseAmount(raw.amount),
    balanceAmount: parseAmount(raw.amount_due),
    paidAmount: parseAmount(raw.amount_paid),
    notes: raw.message || undefined,
    postedAt: raw.issued_on ? new Date(raw.issued_on) : undefined,
    dueAt: raw.due_on ? new Date(raw.due_on) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    metadata: raw as Record<string, unknown>,
  }
}
