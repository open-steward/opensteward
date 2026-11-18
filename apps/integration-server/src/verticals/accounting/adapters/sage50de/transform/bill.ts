/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'

export interface Sage50DeBillLineItem {
  description?: string
  quantity?: number
  unit_price?: number
  tax_amount?: number
  net_amount?: number
  total_amount?: number
  [key: string]: unknown
}

export interface Sage50DeBill {
  id: string
  displayed_as?: string
  date?: string
  due_date?: string
  net_amount?: number
  tax_amount?: number
  total_amount?: number
  outstanding_amount?: number
  status?: string
  currency?: { id?: string }
  contact?: { id?: string; displayed_as?: string }
  invoice_lines?: Sage50DeBillLineItem[]
  [key: string]: unknown
}

function toBillStatus(status: string | undefined): BillStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT'
    case 'OPEN': return 'AUTHORIZED'
    case 'PAID': return 'PAID'
    case 'VOID': return 'VOIDED'
    default: return 'DRAFT'
  }
}

export function transformBill(raw: Sage50DeBill): Bill {
  const lineItems: Lineitem[] = (raw.invoice_lines ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    taxAmount: item.tax_amount,
    totalAmount: item.total_amount,
    metadata: item as Record<string, unknown>,
  }))

  return {
    id: String(raw.id),
    billNumber: raw.displayed_as,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    totalAmount: raw.total_amount,
    taxAmount: raw.tax_amount,
    balanceAmount: raw.outstanding_amount,
    status: toBillStatus(raw.status),
    currency: raw.currency?.id,
    contactId: raw.contact?.id,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
