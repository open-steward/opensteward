import type { Bill, BillStatus } from '../../../schema/bill'

/**
 * Calxa bill (supplier invoice / accounts-payable document) as returned by
 * GET /bills and GET /bills/:id.
 */
export interface CalxaBill {
  id: string
  /** Human-readable bill/invoice number from the supplier. */
  billNumber?: string
  /** Identifier of the contact (supplier) who issued the bill. */
  contactId?: string
  /** Lifecycle status: "draft" | "authorised" | "paid" | "voided" | "deleted". */
  status?: string
  /** ISO 4217 currency code. */
  currency?: string
  /** Grand total including tax. */
  total?: number
  /** Total tax component. */
  totalTax?: number
  /** Outstanding balance. */
  amountDue?: number
  /** Amount paid so far. */
  amountPaid?: number
  /** ISO 8601 bill date. */
  date?: string
  /** ISO 8601 due date. */
  dueDate?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(status?: string): BillStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'authorised':
    case 'authorized':
      return 'AUTHORIZED'
    case 'paid':
      return 'PAID'
    case 'voided':
    case 'void':
      return 'VOIDED'
    case 'deleted':
      return 'DELETED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'DRAFT'
  }
}

export function transformBill(raw: CalxaBill): Bill {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.billNumber || undefined,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    taxAmount: raw.totalTax ?? undefined,
    balanceAmount: raw.amountDue ?? undefined,
    paidAmount: raw.amountPaid ?? undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
