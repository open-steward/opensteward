/**
 * Manager purchase-invoice → canonical Bill transform.
 *
 * API endpoint: GET /api2/purchase-invoices
 *               GET /api2/purchase-invoices/{key}
 *
 * Manager amounts are plain floats in the document currency.
 * Canonical Amount is z.number().int() (minor units / cents), so all floats
 * must be multiplied by 100 and rounded before being stored.
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

/** Convert a Manager decimal float (e.g. 125.50) to integer minor units (12550). */
function toMinorUnits(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

export interface ManagerPurchaseInvoiceLine {
  item?: string
  account?: string
  lineDescription?: string
  qty?: number
  unitPrice?: number
  taxCode?: string
  discount?: number
  taxAmount?: { value?: number; currency?: string | null }
  amount?: { value?: number; currency?: string | null }
  [key: string]: unknown
}

export interface ManagerPurchaseInvoice {
  key?: string
  issueDate?: string
  dueDate?: string
  reference?: string
  supplier?: string
  description?: string
  invoiceAmount?: { value?: number; currency?: string | null }
  balanceDue?: { value?: number; currency?: string | null }
  /** e.g. "PaidInFull", "Unpaid", "PartiallyPaid", "Overdue", "Void" */
  status?: string
  closedInvoice?: boolean
  lines?: ManagerPurchaseInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: ManagerPurchaseInvoice): BillStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paidinfull' || s === 'paid') return 'PAID'
  if (s === 'partiallypaid' || s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (raw.closedInvoice) return 'PAID'
  if (s === 'unpaid') return 'AUTHORIZED'
  return 'DRAFT'
}

function mapLineitem(line: ManagerPurchaseInvoiceLine): Lineitem {
  return {
    itemId: line.item || undefined,
    accountId: line.account || undefined,
    itemDescription: line.lineDescription || undefined,
    unitAmount: toMinorUnits(line.unitPrice),
    unitQuantity: line.qty != null ? Math.round(line.qty) : undefined,
    taxAmount: toMinorUnits(line.taxAmount?.value),
    discountAmount: toMinorUnits(line.discount),
    totalAmount: toMinorUnits(line.amount?.value),
  }
}

export function transformBill(raw: ManagerPurchaseInvoice): Bill {
  const totalAmount = toMinorUnits(raw.invoiceAmount?.value)
  const balanceAmount = toMinorUnits(raw.balanceDue?.value)

  return {
    id: raw.key,
    status: mapStatus(raw),
    billNumber: raw.reference || raw.key,
    contactId: raw.supplier || undefined,
    totalAmount,
    balanceAmount,
    paidAmount:
      totalAmount != null && balanceAmount != null ? totalAmount - balanceAmount : undefined,
    notes: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
