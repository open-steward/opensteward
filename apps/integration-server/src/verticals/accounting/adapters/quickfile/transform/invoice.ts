import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'
import { toMinorUnits, prefixedId, unprefixedId, toCalendarDate } from '../../shared/transform'

/** Safely parse a QuickFile date string into a Date. Never throws. */
function toDate(val: unknown): Date | undefined {
  const iso = toIsoDatetime(val)
  return iso ? new Date(iso) : undefined
}

// QuickFile invoice status values
// DRAFT, SENT, DISPUTED, PAIDPART, PAIDFULL, ACTIVE, UNPAID, DELETED, AGED, PAUSED, AGREED, DECLINED

export interface QuickFileInvoiceLine {
  ItemID?: number
  ItemName?: string
  ItemDescription?: string
  ItemNominalCode?: string
  UnitCost?: number
  Qty?: number
  Tax1?: { TaxPercentage?: number; TaxAmount?: number }
  SubTotal?: number
  Total?: number
  [key: string]: unknown
}

export interface QuickFileInvoice {
  InvoiceID: number
  InvoiceNumber?: string
  InvoiceType?: string   // INVOICE, ESTIMATE, RECURRING
  Status?: string        // DRAFT, SENT, PAIDPART, PAIDFULL, DISPUTED, DELETED, etc.
  ClientID?: number
  ClientName?: string
  Currency?: string
  IssueDate?: string
  DueDate?: string
  // Amounts in the API are decimal strings or numbers
  GrossAmount?: number
  NetAmount?: number
  VatAmount?: number
  AmountOutstanding?: number
  AmountPaid?: number
  PurchaseReference?: string
  Notes?: string
  InvoiceLines?: QuickFileInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): InvoiceStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PAIDFULL':
      return 'PAID'
    case 'PAIDPART':
      return 'PARTIALLY_PAID'
    case 'SENT':
    case 'ACTIVE':
      return 'AUTHORIZED'
    case 'DISPUTED':
      return 'OVERDUE'
    case 'DELETED':
      return 'DELETED'
    case 'DRAFT':
      return 'DRAFT'
    case 'AGED':
      return 'OVERDUE'
    default:
      return 'DRAFT'
  }
}

function mapLineItem(line: QuickFileInvoiceLine): Lineitem {
  return {
    id: line.ItemID != null ? String(line.ItemID) : undefined,
    itemName: line.ItemName || undefined,
    itemDescription: line.ItemDescription || undefined,
    accountId: line.ItemNominalCode || undefined,
    unitAmount: toMinorUnits(line.UnitCost),
    unitQuantity: line.Qty != null ? Math.round(line.Qty) : undefined,
    taxAmount: toMinorUnits(line.Tax1?.TaxAmount),
    totalAmount: toMinorUnits(line.Total ?? line.SubTotal),
  }
}

export function transformInvoice(raw: QuickFileInvoice): Invoice {
  return {
    id: String(raw.InvoiceID),
    type: 'INVOICE',
    status: mapStatus(raw.Status),
    invoiceNumber: raw.InvoiceNumber || undefined,
    contactId: prefixedId('cust', raw.ClientID),
    currency: raw.Currency || undefined,
    totalAmount: toMinorUnits(raw.GrossAmount),
    taxAmount: toMinorUnits(raw.VatAmount),
    balanceAmount: toMinorUnits(raw.AmountOutstanding),
    paidAmount: toMinorUnits(raw.AmountPaid),
    reference: raw.PurchaseReference || undefined,
    notes: raw.Notes || undefined,
    lineItems: Array.isArray(raw.InvoiceLines) ? raw.InvoiceLines.map(mapLineItem) : undefined,
    postedAt: toDate(raw.IssueDate),
    dueAt: toDate(raw.DueDate),
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    InvoiceType: 'INVOICE',
    ClientID: invoice.contactId ? Number(unprefixedId('cust', invoice.contactId)) : undefined,
    Currency: invoice.currency,
    IssueDate: toCalendarDate(invoice.postedAt),
    DueDate: toCalendarDate(invoice.dueAt),
    PurchaseReference: invoice.reference,
    Notes: invoice.notes,
    InvoiceLines: invoice.lineItems?.map((li) => ({
      ItemName: li.itemName,
      ItemDescription: li.itemDescription,
      ItemNominalCode: li.accountId,
      UnitCost: li.unitAmount,
      Qty: li.unitQuantity,
    })),
  }
}
