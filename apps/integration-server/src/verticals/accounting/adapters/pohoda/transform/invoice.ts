/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

export interface PohodaInvoiceLine {
  id: string | number
  text?: string
  unitPrice?: number
  quantity?: number
  amount?: number
  vatAmount?: number
  accountId?: string
  [key: string]: unknown
}

export interface PohodaInvoice {
  id: string | number
  number?: string
  date?: string
  maturity?: string
  totalAmount?: number
  vatAmount?: number
  state?: number
  partnerId?: string | number
  currency?: string
  items?: PohodaInvoiceLine[]
  [key: string]: unknown
}

function mapStatus(state?: number): InvoiceStatus {
  switch (state) {
    case 3: return 'PAID'
    case 2: return 'AUTHORIZED'
    case 0: return 'VOIDED'
    case 1: default: return 'DRAFT'
  }
}

export function transformInvoice(raw: PohodaInvoice): Invoice {
  return {
    id: String(raw.id),
    type: 'INVOICE',
    status: mapStatus(raw.state),
    invoiceNumber: raw.number || undefined,
    contactId: raw.partnerId ? String(raw.partnerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    taxAmount: raw.vatAmount,
    balanceAmount: raw.totalAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.maturity ? new Date(raw.maturity) : undefined,
    lineItems: (raw.items ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.text || undefined,
      unitAmount: l.unitPrice,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      taxAmount: l.vatAmount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
