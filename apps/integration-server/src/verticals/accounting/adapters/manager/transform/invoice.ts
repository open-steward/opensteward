import { toCalendarDate } from '../../shared/transform'
/**
 * Manager sales-invoice → canonical Invoice transform.
 *
 * API endpoint: GET /api2/sales-invoices
 *               GET /api2/sales-invoices/{key}
 *               POST /api2/sales-invoice-form  (create)
 *               PUT  /api2/sales-invoice-form/{key}  (update)
 *
 * Manager amounts are plain floats in the document currency.
 * Canonical Amount is z.number().int() (minor units / cents), so all floats
 * must be multiplied by 100 and rounded before being stored.
 * Status derives from the `status` string field (e.g. "PaidInFull",
 * "Unpaid", "PartiallyPaid", "Overdue") and the `closedInvoice` flag.
 */
import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

/** Convert a Manager decimal float (e.g. 125.50) to integer minor units (12550). */
function toMinorUnits(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  return Math.round(value * 100)
}

export interface ManagerInvoiceLine {
  item?: string
  account?: string
  lineDescription?: string
  qty?: number
  salesUnitPrice?: number
  taxCode?: string
  discount?: number
  taxAmount?: { value?: number; currency?: string | null }
  amount?: { value?: number; currency?: string | null }
  [key: string]: unknown
}

export interface ManagerSalesInvoice {
  /** UUID key used as the record id */
  key?: string
  issueDate?: string
  dueDate?: string
  reference?: string
  customer?: string
  description?: string
  invoiceAmount?: { value?: number; currency?: string | null }
  balanceDue?: { value?: number; currency?: string | null }
  /** e.g. "PaidInFull", "Unpaid", "PartiallyPaid", "Overdue", "Void" */
  status?: string
  closedInvoice?: boolean
  discount?: number
  withholdingTax?: { value?: number; currency?: string | null }
  lines?: ManagerInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(raw: ManagerSalesInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'void' || s === 'voided') return 'VOIDED'
  if (s === 'paidinfull' || s === 'paid') return 'PAID'
  if (s === 'partiallypaid' || s === 'partial') return 'PARTIALLY_PAID'
  if (s === 'overdue') return 'OVERDUE'
  if (s === 'unpaid' || s === 'authorized') return 'AUTHORIZED'
  if (raw.closedInvoice) return 'PAID'
  return 'DRAFT'
}

function mapLineitem(line: ManagerInvoiceLine): Lineitem {
  return {
    itemId: line.item || undefined,
    accountId: line.account || undefined,
    itemDescription: line.lineDescription || undefined,
    unitAmount: toMinorUnits(line.salesUnitPrice),
    unitQuantity: line.qty != null ? Math.round(line.qty) : undefined,
    taxAmount: toMinorUnits(line.taxAmount?.value),
    discountAmount: toMinorUnits(line.discount),
    totalAmount: toMinorUnits(line.amount?.value),
  }
}

export function transformInvoice(raw: ManagerSalesInvoice): Invoice {
  const totalAmount = toMinorUnits(raw.invoiceAmount?.value)
  const balanceAmount = toMinorUnits(raw.balanceDue?.value)

  return {
    id: raw.key,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.reference || raw.key,
    contactId: raw.customer || undefined,
    totalAmount,
    balanceAmount,
    paidAmount:
      totalAmount != null && balanceAmount != null ? totalAmount - balanceAmount : undefined,
    reference: raw.reference || undefined,
    notes: raw.description || undefined,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Convert integer minor units back to the decimal float Manager expects on write. */
function fromMinorUnits(value: number | null | undefined): number | undefined {
  if (value == null) return undefined
  return value / 100
}

/** Canonical Invoice → Manager sales-invoice-form POST/PUT body */
export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    customer: invoice.contactId,
    issueDate: toCalendarDate(invoice.postedAt),
    dueDate: toCalendarDate(invoice.dueAt),
    reference: invoice.reference,
    description: invoice.notes,
    lines: invoice.lineItems?.map((li) => ({
      item: li.itemId,
      account: li.accountId,
      lineDescription: li.itemDescription,
      qty: li.unitQuantity,
      salesUnitPrice: fromMinorUnits(li.unitAmount),
    })),
  }
}
