/**
 * Scopevisio outgoing-invoice → canonical Invoice transform.
 *
 * Scopevisio field notes:
 *  - `id`            : internal numeric master ID
 *  - `documentNumber`: human-readable invoice number (Belegnummer), e.g. "RE-2024-0001"
 *  - `documentDate`  : epoch milliseconds (invoice date)
 *  - `dueDate`       : epoch milliseconds
 *  - `totalGross`    : total amount including VAT
 *  - `totalVat`      : VAT portion
 *  - `totalNet`      : net total (excl. VAT)
 *  - `openAmount`    : outstanding balance
 *  - `customerContactId`: internal contact ID
 *  - `currency`      : ISO 4217 code
 *  - `status`        : string – "DRAFT", "POSTED", "PAID", "CANCELLED", etc.
 *  - `positions`     : line items array
 *
 * List endpoint: POST /outgoinginvoices
 * Detail endpoint: GET /outgoinginvoice/{documentNumber}
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface ScopevisioInvoicePosition {
  id?: number
  positionNumber?: number
  productId?: number | null
  productNumber?: string | null
  name?: string | null
  description?: string | null
  quantity?: number | null
  unitPrice?: number | null
  totalNet?: number | null
  totalGross?: number | null
  totalVat?: number | null
  accountNumber?: string | null
  [key: string]: unknown
}

export interface ScopevisioOutgoingInvoice {
  id?: number
  documentNumber?: string
  status?: string
  customerContactId?: number
  customerContactName?: string
  customerPersonalAccountNumber?: string
  documentDate?: number      // epoch ms
  dueDate?: number           // epoch ms
  postingDate?: number       // epoch ms
  currency?: string
  totalGross?: number
  totalNet?: number
  totalVat?: number
  openAmount?: number
  isPaid?: boolean
  orderNumber?: string
  documentText?: string
  positions?: ScopevisioInvoicePosition[]
  [key: string]: unknown
}

/** Maps Scopevisio invoice status strings to canonical InvoiceStatus. */
function mapStatus(raw: ScopevisioOutgoingInvoice): InvoiceStatus {
  const s = (raw.status ?? '').toUpperCase()
  if (s === 'CANCELLED' || s === 'STORNIERT') return 'VOIDED'
  if (raw.isPaid || s === 'PAID' || s === 'BEZAHLT') return 'PAID'
  if (s === 'POSTED' || s === 'GEBUCHT') {
    const open = raw.openAmount ?? 0
    const total = raw.totalGross ?? 0
    if (open === 0) return 'PAID'
    if (open > 0 && open < total) return 'PARTIALLY_PAID'
    return 'AUTHORIZED'
  }
  if (s === 'DRAFT' || s === 'ENTWURF') return 'DRAFT'
  return 'DRAFT'
}

function toDate(epochMs?: number | null): Date | undefined {
  if (!epochMs) return undefined
  return new Date(epochMs)
}

function mapPosition(pos: ScopevisioInvoicePosition): Lineitem {
  return {
    id: pos.id !== undefined ? String(pos.id) : undefined,
    accountId: pos.accountNumber || undefined,
    itemId: pos.productNumber || undefined,
    itemName: pos.name || undefined,
    itemDescription: pos.description || undefined,
    unitAmount: pos.unitPrice ?? undefined,
    unitQuantity: pos.quantity !== undefined && pos.quantity !== null ? Math.round(pos.quantity) : undefined,
    totalAmount: pos.totalGross ?? undefined,
    taxAmount: pos.totalVat ?? undefined,
  }
}

export function transformInvoice(raw: ScopevisioOutgoingInvoice): Invoice {
  return {
    id: raw.documentNumber ?? (raw.id !== undefined ? String(raw.id) : undefined),
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.documentNumber || undefined,
    contactId: raw.customerContactId !== undefined ? String(raw.customerContactId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalGross ?? undefined,
    taxAmount: raw.totalVat ?? undefined,
    balanceAmount: raw.openAmount ?? undefined,
    reference: raw.orderNumber || undefined,
    notes: raw.documentText || undefined,
    lineItems: (raw.positions ?? []).map(mapPosition),
    postedAt: toDate(raw.documentDate),
    dueAt: toDate(raw.dueDate),
    metadata: raw as Record<string, unknown>,
  }
}
