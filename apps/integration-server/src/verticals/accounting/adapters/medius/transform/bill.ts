/**
 * Medius supplier invoice → canonical Bill.
 *
 * Medius AP Automation surfaces supplier invoices via the ERP sync message
 * API: GET /integration/message/v1/supplierInvoice/invoices/{status}
 * Response body: IntegrationSupplierInvoiceDto[]
 *
 * Key fields (from Medius OpenAPI spec — api.medius.com/mediusapisandboxqa/openapi/stable):
 *   documentId        – Medius internal numeric id
 *   invoiceNumber     – supplier-assigned invoice number
 *   supplierExternalSystemId / supplierId – supplier identifiers
 *   supplierName      – supplier display name
 *   currencyCode      – ISO 4217 code
 *   netAmount         – net total (decimal, e.g. 1250.00)
 *   taxAmount         – tax total (decimal)
 *   totalAmount       – gross total (decimal)
 *   invoiceDate       – ISO 8601 date-time string
 *   dueDate           – ISO 8601 date-time string
 *   preferredPaymentDate – ISO 8601 date-time string
 *   isPaymentBlocked
 *   invoiceLines[]    – IntegrationSupplierInvoiceLineDto
 *
 * MONEY: All Medius amounts are decimal format (e.g. 1250.00). Canonical
 * amounts are integer minor units — multiply by 100 and Math.round().
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

// ── Raw Medius types ───────────────────────────────────────────────────────────

export interface MediusInvoiceLine {
  lineNumber: number
  itemDescription?: string
  itemNumber?: string
  amount: number
  quantity?: number
  unitPrice?: number
  [key: string]: unknown
}

export interface MediusSupplierInvoice {
  documentId: number
  invoiceNumber?: string
  supplierExternalSystemId?: string
  supplierId?: string
  supplierName?: string
  currencyCode?: string
  netAmount?: number
  taxAmount?: number
  totalAmount: number
  invoiceDate?: string
  dueDate?: string
  preferredPaymentDate?: string
  isPaymentBlocked?: boolean
  invoiceLines?: MediusInvoiceLine[]
  companyExternalSystemId?: string
  companyId?: string
  companyName?: string
  paymentReference?: string
  invoiceReference?: string
  finalVoucherNumber?: string
  preliminaryVoucherNumber?: string
  receivedDate?: string
  vatDate?: string
  [key: string]: unknown
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Convert a Medius decimal amount string/number to canonical integer minor units.
 * Medius returns amounts as decimal numbers (e.g. 1250.00 for $1,250.00).
 * Returns undefined when input is null/undefined (missing-rather-than-wrong).
 */
function toMinorUnits(val: number | null | undefined): number | undefined {
  if (val == null) return undefined
  return Math.round(val * 100)
}

function tryParseDate(val: unknown): Date | undefined {
  if (val === null || val === undefined || val === '') return undefined
  if (typeof val !== 'string' && typeof val !== 'number' && !(val instanceof Date)) return undefined
  const d = val instanceof Date ? val : new Date(val as string | number)
  return isNaN(d.getTime()) ? undefined : d
}

function mapStatus(raw: MediusSupplierInvoice): BillStatus {
  // Medius doesn't expose a simple "paid" boolean in this DTO;
  // approximate from blocking state and whether a final voucher exists.
  if (raw.finalVoucherNumber) return 'PAID'
  if (raw.isPaymentBlocked) return 'AUTHORIZED'
  const dueDate = tryParseDate(raw.dueDate)
  if (dueDate && dueDate.getTime() < Date.now()) return 'OVERDUE'
  return 'AUTHORIZED'
}

function mapLines(lines: MediusInvoiceLine[] | undefined): Lineitem[] {
  if (!lines?.length) return []
  return lines.map((l) => ({
    id: String(l.lineNumber),
    itemDescription: typeof l.itemDescription === 'string' ? l.itemDescription || undefined : undefined,
    itemName: typeof l.itemNumber === 'string' ? l.itemNumber || undefined : undefined,
    // Medius unitPrice and amount are decimals — convert to integer minor units
    unitAmount: toMinorUnits(l.unitPrice != null ? l.unitPrice : undefined),
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: toMinorUnits(l.amount),
  }))
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformBill(raw: MediusSupplierInvoice): Bill {
  const lines = mapLines(raw.invoiceLines)
  // Medius amounts are decimal — convert to integer minor units
  const totalMinor = toMinorUnits(raw.totalAmount)
  return {
    id: String(raw.documentId),
    status: mapStatus(raw),
    billNumber: typeof raw.invoiceNumber === 'string' ? raw.invoiceNumber || undefined : undefined,
    // Prefer externalSystemId; fall back to Medius internal supplierId
    contactId: (typeof raw.supplierExternalSystemId === 'string' ? raw.supplierExternalSystemId : undefined)
      || (typeof raw.supplierId === 'string' ? raw.supplierId : undefined)
      || undefined,
    currency: typeof raw.currencyCode === 'string' ? raw.currencyCode || undefined : undefined,
    totalAmount: totalMinor,
    taxAmount: toMinorUnits(raw.taxAmount),
    paidAmount: raw.finalVoucherNumber ? totalMinor : undefined,
    notes: typeof raw.invoiceReference === 'string' ? raw.invoiceReference || undefined : undefined,
    lineItems: lines.length ? lines : undefined,
    postedAt: tryParseDate(raw.invoiceDate),
    dueAt: tryParseDate(raw.dueDate),
    metadata: raw as Record<string, unknown>,
  }
}
