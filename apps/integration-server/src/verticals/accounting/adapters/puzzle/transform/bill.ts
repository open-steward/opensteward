import { toCalendarDate } from '../../shared/transform'
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import type { PuzzleMoney } from './invoice'

// ── Puzzle wire types ─────────────────────────────────────────────────────────

export interface PuzzleBillLine {
  id: string
  amount: PuzzleMoney
  coaKey: string
  quantity?: number
  unitPrice?: string
  description?: string
  [key: string]: unknown
}

export interface PuzzleBill {
  id: string
  createdAt: string
  updatedAt: string
  issueDate: string
  dueDate?: string
  removedAt?: string
  voidedAt?: string
  paidAt?: string
  submittedAt?: string
  vendorId?: string
  externalId?: string
  description?: string
  amount: PuzzleMoney
  status: string          // Draft | Posted | Voided | Paid | Deleted
  currentness?: string    // Current | Overdue
  lines: PuzzleBillLine[]
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, BillStatus> = {
  Draft: 'DRAFT',
  Posted: 'AUTHORIZED',
  Voided: 'VOIDED',
  Paid: 'PAID',
  Deleted: 'DELETED',
}

function mapStatus(raw: PuzzleBill): BillStatus {
  if (raw.currentness === 'Overdue') return 'OVERDUE'
  if (raw.status in STATUS_MAP) return STATUS_MAP[raw.status]!
  return 'AUTHORIZED'
}

// ── Line mapping ──────────────────────────────────────────────────────────────

function mapLines(lines: PuzzleBillLine[]): Lineitem[] {
  return (lines ?? []).map((l) => ({
    id: l.id || undefined,
    itemDescription: l.description || undefined,
    unitAmount: l.unitPrice != null ? Math.round(parseFloat(l.unitPrice) * 100) : undefined,
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: l.amount?.amount != null ? Math.round(parseFloat(l.amount.amount) * 100) : undefined,
  }))
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformBill(raw: PuzzleBill): Bill {
  const totalCents =
    raw.amount?.amount != null ? Math.round(parseFloat(raw.amount.amount) * 100) : undefined

  return {
    id: raw.id,
    status: mapStatus(raw),
    billNumber: raw.externalId || undefined,
    contactId: raw.vendorId || undefined,
    currency: raw.amount?.currency || undefined,
    totalAmount: totalCents,
    notes: raw.description || undefined,
    lineItems: mapLines(raw.lines ?? []),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    paidAt: raw.paidAt ? new Date(raw.paidAt) : undefined,
    cancelledAt: raw.voidedAt ? new Date(raw.voidedAt) : raw.removedAt ? new Date(raw.removedAt) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformBill(
  bill: Partial<Bill>,
  companyId: string,
): Record<string, unknown> {
  return {
    companyId,
    vendorId: bill.contactId,
    externalId: bill.billNumber,
    description: bill.notes,
    issueDate: toCalendarDate(bill.postedAt),
    dueDate: toCalendarDate(bill.dueAt),
    shouldPost: bill.status !== 'DRAFT',
    lines: (bill.lineItems ?? []).map((li) => ({
      companyId,
      amount: li.totalAmount != null ? (li.totalAmount / 100).toFixed(2) : '0.00',
      currency: bill.currency ?? 'USD',
      coaKey: (li as Record<string, unknown>)['coaKey'] ?? 'operating_expenses',
      description: li.itemDescription,
      quantity: li.unitQuantity,
      unitPrice: li.unitAmount != null ? (li.unitAmount / 100).toFixed(2) : undefined,
    })),
  }
}
