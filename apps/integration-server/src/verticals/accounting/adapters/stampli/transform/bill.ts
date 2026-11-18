/**
 * Stampli vendor invoice → canonical Bill transform.
 *
 * Stampli is an AP-automation platform. Every document flowing through its
 * system is a vendor (supplier) invoice — mapped to the canonical Bill type.
 *
 * Wire shape (camelCase JSON):
 *   id, invoiceNumber, vendorId, status, invoiceDate, dueDate,
 *   totalAmount, taxAmount, amountDue, amountPaid, currency,
 *   description, purchaseOrderNumber, lineItems[]
 */
import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface StampliLineItem {
  id?: string
  glAccountId?: string
  glAccountCode?: string
  description?: string
  quantity?: number
  unitPrice?: number
  amount?: number
  taxAmount?: number
  [key: string]: unknown
}

export interface StampliInvoice {
  id: string
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
  lineItems?: StampliLineItem[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// Stampli invoice status → canonical BillStatus
function mapStatus(status?: string): BillStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'VOIDED':
    case 'VOID':
    case 'CANCELLED':
    case 'REJECTED':
      return 'VOIDED'
    case 'PAID':
    case 'COMPLETE':
    case 'COMPLETED':
      return 'PAID'
    case 'PARTIAL':
    case 'PARTIALLY_PAID':
    case 'PARTIAL_PAYMENT':
      return 'PARTIALLY_PAID'
    case 'APPROVED':
    case 'AUTHORIZED':
    case 'READY_TO_PAY':
      return 'AUTHORIZED'
    case 'SUBMITTED':
    case 'PENDING_APPROVAL':
    case 'IN_REVIEW':
    case 'IN_WORKFLOW':
      return 'SUBMITTED'
    case 'OVERDUE':
    case 'PAST_DUE':
      return 'OVERDUE'
    case 'DRAFT':
    case 'NEW':
    case 'RECEIVED':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(raw: StampliLineItem): Lineitem {
  return {
    id: raw.id || undefined,
    accountId: raw.glAccountId || raw.glAccountCode || undefined,
    itemDescription: raw.description || undefined,
    unitAmount: raw.unitPrice,
    unitQuantity: raw.quantity !== undefined ? Math.round(raw.quantity) : undefined,
    totalAmount: raw.amount,
    taxAmount: raw.taxAmount || undefined,
  }
}

export function transformBill(raw: StampliInvoice): Bill {
  return {
    id: raw.id,
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
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
