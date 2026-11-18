/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface FoundationInvoiceLine {
  LineId: string | number
  Description: string
  Quantity: number
  UnitPrice: number
  TotalAmount: number
  TaxAmount: number
  AccountNumber: string
  [key: string]: unknown
}

export interface FoundationInvoice {
  InvoiceNumber: string
  JobNumber: string
  VendorId: string
  InvoiceDate: string
  DueDate: string
  Amount: number
  TaxAmount: number
  Balance: number
  Currency: string
  Status: string
  Lines: FoundationInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status: string): InvoiceStatus {
  switch (status) {
    case 'Approved':
      return 'AUTHORIZED'
    case 'Paid':
      return 'PAID'
    case 'Void':
      return 'VOIDED'
    case 'Draft':
    default:
      return 'DRAFT'
  }
}

function mapLineitem(line: FoundationInvoiceLine): Lineitem {
  return {
    id: String(line.LineId),
    accountId: line.AccountNumber || undefined,
    itemDescription: line.Description || undefined,
    unitAmount: line.UnitPrice,
    unitQuantity: line.Quantity,
    totalAmount: line.TotalAmount,
    taxAmount: line.TaxAmount || undefined,
  }
}

export function transformInvoice(raw: FoundationInvoice): Invoice {
  return {
    id: String(raw.InvoiceNumber),
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.InvoiceNumber || undefined,
    contactId: raw.VendorId || undefined,
    currency: raw.Currency || undefined,
    totalAmount: raw.Amount,
    taxAmount: raw.TaxAmount || undefined,
    balanceAmount: raw.Balance || undefined,
    lineItems: (raw.Lines ?? []).map(mapLineitem),
    postedAt: raw.InvoiceDate ? new Date(raw.InvoiceDate) : undefined,
    dueAt: raw.DueDate ? new Date(raw.DueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
