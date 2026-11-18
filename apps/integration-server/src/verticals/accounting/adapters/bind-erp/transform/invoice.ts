/**
 * Bind ERP → canonical Invoice transform.
 *
 * Bind ERP returns two flavours:
 *   - InvoiceListItem  – from GET /api/Invoices  (list)
 *   - InvoiceDetails   – from GET /api/Invoices/{id}  (detail, includes line items)
 *
 * Status codes (StatusCode field in details, Status int in list):
 *   1 = open/active, 2 = cancelled/voided, 3 = fully paid
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── Raw Bind ERP types ──────────────────────────────────────────────────────

export interface BindInvoiceProduct {
  ProductID?: string
  Name?: string
  Code?: string
  Qty?: number
  Price?: number
  VATRate?: number
  Discount?: number
  IndexNumber?: number
  [key: string]: unknown
}

export interface BindInvoiceService {
  ServiceID?: string
  Name?: string
  Code?: string
  Qty?: number
  Price?: number
  VATRate?: number
  Discount?: number
  IndexNumber?: number
  [key: string]: unknown
}

/** Detailed invoice returned by GET /api/Invoices/{id} */
export interface BindInvoiceDetails {
  ID?: string
  UUID?: string
  Series?: string
  Number?: number
  ClientID?: string
  ClientName?: string
  Status?: string
  StatusCode?: number
  CreationDate?: string
  ApplicationDate?: string
  CurrencyName?: string
  ExchangeRate?: number
  PurchaseOrder?: string
  Comments?: string
  Subtotal?: number
  Discount?: number
  VAT?: number
  IEPS?: number
  VATRet?: number
  ISRRet?: number
  Payments?: number
  CreditNotes?: number
  Products?: BindInvoiceProduct[]
  Services?: BindInvoiceService[]
  [key: string]: unknown
}

/** List item returned by GET /api/Invoices */
export interface BindInvoiceListItem {
  Serie?: string
  Date?: string
  Number?: number
  UUID?: string
  ExpirationDate?: string
  ClientID?: string
  ClientName?: string
  RFC?: string
  Subtotal?: number
  Discount?: number
  VAT?: number
  IEPS?: number
  ISRRet?: number
  VATRet?: number
  Total?: number
  Payments?: number
  CreditNotes?: number
  CurrencyID?: string
  Comments?: string
  VATRate?: number
  PurchaseOrder?: string
  IsFiscalInvoice?: boolean
  Status?: number
  [key: string]: unknown
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapStatusCode(code?: number): InvoiceStatus {
  if (code === 2) return 'VOIDED'
  if (code === 3) return 'PAID'
  return 'AUTHORIZED'
}

function mapStatusInt(status?: number): InvoiceStatus {
  // Bind ERP list items use numeric Status; 0 = open/active, 1 = cancelled
  // (values inferred from SDK – treat conservatively)
  if (status === 1) return 'VOIDED'
  return 'AUTHORIZED'
}

function productToLineitem(p: BindInvoiceProduct): Lineitem {
  return {
    id: p.IndexNumber !== undefined ? String(p.IndexNumber) : undefined,
    itemId: p.ProductID || undefined,
    itemName: p.Name || undefined,
    itemSku: p.Code || undefined,
    unitAmount: p.Price,
    unitQuantity: p.Qty !== undefined ? Math.round(p.Qty) : undefined,
    taxAmount: p.VATRate !== undefined && p.Price !== undefined && p.Qty !== undefined
      ? Math.round(p.Price * p.Qty * (p.VATRate / 100) * 100) / 100
      : undefined,
    discountAmount: p.Discount || undefined,
  }
}

function serviceToLineitem(s: BindInvoiceService): Lineitem {
  return {
    id: s.IndexNumber !== undefined ? String(s.IndexNumber) : undefined,
    itemId: s.ServiceID || undefined,
    itemName: s.Name || undefined,
    itemSku: s.Code || undefined,
    unitAmount: s.Price,
    unitQuantity: s.Qty !== undefined ? Math.round(s.Qty) : undefined,
    taxAmount: s.VATRate !== undefined && s.Price !== undefined && s.Qty !== undefined
      ? Math.round(s.Price * s.Qty * (s.VATRate / 100) * 100) / 100
      : undefined,
    discountAmount: s.Discount || undefined,
  }
}

// ── Transforms ───────────────────────────────────────────────────────────────

/** Transform a detailed invoice (from GET /api/Invoices/{id}) */
export function transformInvoiceDetails(raw: BindInvoiceDetails): Invoice {
  const productLines: Lineitem[] = (raw.Products ?? []).map(productToLineitem)
  const serviceLines: Lineitem[] = (raw.Services ?? []).map(serviceToLineitem)
  const lineItems = [...productLines, ...serviceLines]

  // Compute total: subtotal - discount + VAT + IEPS - VATRet - ISRRet
  const total = (raw.Subtotal ?? 0)
    - (raw.Discount ?? 0)
    + (raw.VAT ?? 0)
    + (raw.IEPS ?? 0)
    - (raw.VATRet ?? 0)
    - (raw.ISRRet ?? 0)

  const paidAmount = raw.Payments ?? 0
  const balance = Math.max(0, total - paidAmount)

  return {
    id: raw.ID || raw.UUID || String(raw.Number ?? ''),
    type: 'INVOICE',
    status: mapStatusCode(raw.StatusCode),
    invoiceNumber: raw.Series && raw.Number ? `${raw.Series}${raw.Number}` : raw.Number ? String(raw.Number) : undefined,
    contactId: raw.ClientID || undefined,
    currency: raw.CurrencyName || undefined,
    totalAmount: total,
    taxAmount: (raw.VAT ?? 0) + (raw.IEPS ?? 0) - (raw.VATRet ?? 0) - (raw.ISRRet ?? 0),
    discountAmount: raw.Discount || undefined,
    paidAmount: paidAmount || undefined,
    balanceAmount: balance || undefined,
    reference: raw.PurchaseOrder || undefined,
    notes: raw.Comments || undefined,
    lineItems: lineItems.length ? lineItems : undefined,
    postedAt: raw.ApplicationDate ? new Date(raw.ApplicationDate) : undefined,
    createdAt: raw.CreationDate ? new Date(raw.CreationDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/** Transform a list-item invoice (from GET /api/Invoices) */
export function transformInvoiceListItem(raw: BindInvoiceListItem): Invoice {
  const total = raw.Total ?? (raw.Subtotal ?? 0) - (raw.Discount ?? 0) + (raw.VAT ?? 0)
  const paidAmount = raw.Payments ?? 0
  const balance = Math.max(0, total - paidAmount)

  return {
    id: raw.UUID || (raw.Serie && raw.Number ? `${raw.Serie}${raw.Number}` : String(raw.Number ?? '')),
    type: 'INVOICE',
    status: mapStatusInt(raw.Status),
    invoiceNumber: raw.Serie && raw.Number ? `${raw.Serie}${raw.Number}` : raw.Number ? String(raw.Number) : undefined,
    contactId: raw.ClientID || undefined,
    currency: raw.CurrencyID || undefined,
    totalAmount: total,
    taxAmount: (raw.VAT ?? 0) + (raw.IEPS ?? 0) - (raw.VATRet ?? 0) - (raw.ISRRet ?? 0),
    discountAmount: raw.Discount || undefined,
    paidAmount: paidAmount || undefined,
    balanceAmount: balance || undefined,
    reference: raw.PurchaseOrder || undefined,
    notes: raw.Comments || undefined,
    postedAt: raw.Date ? new Date(raw.Date) : undefined,
    dueAt: raw.ExpirationDate ? new Date(raw.ExpirationDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
