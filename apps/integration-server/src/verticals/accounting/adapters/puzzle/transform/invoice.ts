import { toCalendarDate } from '../../shared/transform'
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Puzzle wire types ─────────────────────────────────────────────────────────

export interface PuzzleMoney {
  amount: string
  currency: string
}

export interface PuzzleInvoiceLine {
  id: string
  amount: PuzzleMoney
  coaKey: string
  quantity?: number
  unitPrice?: string
  description?: string
  [key: string]: unknown
}

export interface PuzzleInvoice {
  id: string
  createdAt: string
  updatedAt: string
  issueDate: string
  dueDate?: string
  removedAt?: string
  customerId?: string
  nativeId?: string
  description?: string
  amount: PuzzleMoney
  status: string          // Draft | Posted | Voided | Paid | Deleted
  lines: PuzzleInvoiceLine[]
  contractId?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, InvoiceStatus> = {
  Draft: 'DRAFT',
  Posted: 'AUTHORIZED',
  Voided: 'VOIDED',
  Paid: 'PAID',
  Deleted: 'DELETED',
}

function mapStatus(raw: PuzzleInvoice): InvoiceStatus {
  // Check overdue before STATUS_MAP: a Posted invoice whose dueDate is in the
  // past should surface as OVERDUE rather than AUTHORIZED.  Puzzle invoices do
  // not carry a `currentness` field (only bills do), so we derive it here.
  if (
    raw.status === 'Posted' &&
    raw.dueDate &&
    new Date(raw.dueDate).getTime() < Date.now()
  ) {
    return 'OVERDUE'
  }
  if (raw.status in STATUS_MAP) return STATUS_MAP[raw.status]!
  return 'AUTHORIZED'
}

// ── Line mapping ──────────────────────────────────────────────────────────────

function mapLines(lines: PuzzleInvoiceLine[]): Lineitem[] {
  return (lines ?? []).map((l) => ({
    id: l.id || undefined,
    itemDescription: l.description || undefined,
    unitAmount: l.unitPrice != null ? Math.round(parseFloat(l.unitPrice) * 100) : undefined,
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: l.amount?.amount != null ? Math.round(parseFloat(l.amount.amount) * 100) : undefined,
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInvoice(raw: PuzzleInvoice): Invoice {
  const totalCents =
    raw.amount?.amount != null ? Math.round(parseFloat(raw.amount.amount) * 100) : undefined

  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.nativeId || undefined,
    contactId: raw.customerId || undefined,
    currency: raw.amount?.currency || undefined,
    totalAmount: totalCents,
    notes: raw.description || undefined,
    lineItems: mapLines(raw.lines ?? []),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    paidAt: raw.status === 'Paid' && raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    cancelledAt: raw.removedAt ? new Date(raw.removedAt) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(
  invoice: Partial<Invoice>,
  companyId: string,
): Record<string, unknown> {
  return {
    companyId,
    customerId: invoice.contactId,
    nativeId: invoice.invoiceNumber,
    description: invoice.notes,
    issueDate: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    lines: (invoice.lineItems ?? []).map((li) => ({
      companyId,
      amount: li.totalAmount != null ? (li.totalAmount / 100).toFixed(2) : '0.00',
      // coaKey is required by Puzzle — callers should set it via metadata
      coaKey: (li as Record<string, unknown>)['coaKey'] ?? 'operating_income',
      description: li.itemDescription,
      quantity: li.unitQuantity,
      unitPrice: li.unitAmount != null ? (li.unitAmount / 100).toFixed(2) : undefined,
    })),
  }
}
