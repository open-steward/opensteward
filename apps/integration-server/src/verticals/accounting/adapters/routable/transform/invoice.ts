/**
 * Transform Routable Receivable → canonical Invoice.
 *
 * In Routable, a "receivable" is an outbound request-for-payment (accounts
 * receivable), which maps to the canonical Invoice type.
 *
 * Docs: https://developers.routable.com/reference/create-receivable
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Routable types ────────────────────────────────────────────────────────────

export interface RoutableLineItem {
  id?: string
  amount?: string | number
  quantity?: number
  unit_price?: string | number
  description?: string
  style?: string
  [key: string]: unknown
}

export interface RoutableReceivable {
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
  type?: string
  [key: string]: unknown
}

// ── Status map ────────────────────────────────────────────────────────────────

function mapStatus(status?: string): InvoiceStatus {
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

function companyId(company?: RoutableReceivable['company']): string | undefined {
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

export function transformInvoice(raw: RoutableReceivable): Invoice {
  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw.status),
    invoiceNumber: raw.bill_number || undefined,
    contactId: companyId(raw.company),
    currency: raw.currency_code || undefined,
    totalAmount: parseAmount(raw.amount),
    balanceAmount: parseAmount(raw.amount_due),
    paidAmount: parseAmount(raw.amount_paid),
    reference: raw.reference || raw.external_id || undefined,
    notes: raw.message || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.issued_on ? new Date(raw.issued_on) : undefined,
    dueAt: raw.due_on ? new Date(raw.due_on) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
