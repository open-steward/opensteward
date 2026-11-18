/**
 * AvidXchange bill (AP invoice) transform.
 *
 * AvidXchange represents each vendor invoice as an "invoice" in its API
 * (because the platform is AP-only); we map these to the canonical Bill type.
 *
 * Key fields (camelCase on the wire):
 *   invoiceId, invoiceNumber, vendorId, companyId, status,
 *   invoiceDate, dueDate, totalAmount, taxAmount, amountDue,
 *   amountPaid, currency, description, lineItems[]
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface AvidXchangeLineItem {
  lineItemId?: string
  glAccountId?: string
  glAccountCode?: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  taxAmount?: number
  [key: string]: unknown
}

export interface AvidXchangeInvoice {
  invoiceId: string
  invoiceNumber?: string
  vendorId?: string
  companyId?: string
  status?: string
  invoiceDate?: string
  dueDate?: string
  receivedDate?: string
  totalAmount?: number
  taxAmount?: number
  amountDue?: number
  amountPaid?: number
  currency?: string
  description?: string
  purchaseOrderNumber?: string
  remittanceInfo?: string
  lineItems?: AvidXchangeLineItem[]
  createdDate?: string
  modifiedDate?: string
  [key: string]: unknown
}

// AvidXchange invoice statuses → canonical BillStatus
function mapStatus(status?: string): BillStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'VOIDED':
    case 'VOID':
    case 'CANCELLED':
      return 'VOIDED'
    case 'PAID':
    case 'COMPLETE':
    case 'COMPLETED':
      return 'PAID'
    case 'PARTIAL':
    case 'PARTIALPAID':
    case 'PARTIALLY_PAID':
      return 'PARTIALLY_PAID'
    case 'APPROVED':
    case 'AUTHORIZED':
      return 'AUTHORIZED'
    case 'SUBMITTED':
    case 'PENDING_APPROVAL':
    case 'IN_WORKFLOW':
      return 'SUBMITTED'
    case 'OVERDUE':
    case 'PASTDUE':
      return 'OVERDUE'
    case 'DRAFT':
    case 'NEW':
    case 'RECEIVED':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(raw: AvidXchangeLineItem): Lineitem {
  return {
    id: raw.lineItemId || undefined,
    accountId: raw.glAccountId || raw.glAccountCode || undefined,
    itemDescription: raw.description || undefined,
    unitAmount: raw.unitPrice,
    unitQuantity: raw.quantity !== undefined ? Math.round(raw.quantity) : undefined,
    totalAmount: raw.amount,
    taxAmount: raw.taxAmount || undefined,
  }
}

export function transformBill(raw: AvidXchangeInvoice): Bill {
  return {
    id: raw.invoiceId,
    status: mapStatus(raw.status),
    billNumber: raw.invoiceNumber || undefined,
    contactId: raw.vendorId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.taxAmount || undefined,
    balanceAmount: raw.amountDue,
    paidAmount: raw.amountPaid || undefined,
    notes: raw.description || undefined,
    lineItems: (raw.lineItems ?? []).map(mapLineitem),
    postedAt: raw.invoiceDate ? new Date(raw.invoiceDate) : undefined,
    dueAt: raw.dueDate ? new Date(raw.dueDate) : undefined,
    createdAt: raw.createdDate ? new Date(raw.createdDate) : undefined,
    updatedAt: raw.modifiedDate ? new Date(raw.modifiedDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
