/**
 * Ramp purchase order → canonical PurchaseOrder.
 *
 * Ramp endpoint: GET /developer/v1/purchase-orders
 *
 * Key fields:
 *   id              string
 *   po_number       string
 *   vendor          object — { id, name }
 *   amount          object — { amount: number, currency_code: string }
 *   status          string — OPEN | CLOSED | CANCELLED | DRAFT
 *   start_date      string — ISO date
 *   end_date        string — ISO date
 *   created_at      string
 *   updated_at      string
 *   line_items      array  — [{ id, description, amount, gl_account_id, quantity, unit_price }]
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface RampPOAmount {
  amount: number
  currency_code: string
}

export interface RampPOVendor {
  id?: string
  name?: string
}

export interface RampPOLineItem {
  id?: string
  description?: string
  amount?: number
  gl_account_id?: string
  quantity?: number
  unit_price?: number
}

export interface RampPurchaseOrder {
  id: string
  po_number?: string
  vendor?: RampPOVendor
  amount?: RampPOAmount
  status?: string
  start_date?: string
  end_date?: string
  created_at?: string
  updated_at?: string
  line_items?: RampPOLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string | undefined): PurchaseOrderStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'OPEN': return 'ACTIVE'
    case 'CLOSED': return 'COMPLETED'
    case 'CANCELLED': return 'CANCELLED'
    case 'DRAFT': return 'DRAFT'
    default: return 'DRAFT'
  }
}

function mapLines(lines: RampPOLineItem[]): Lineitem[] {
  return (lines ?? []).map((l) => ({
    id: l.id || undefined,
    accountId: l.gl_account_id || undefined,
    itemDescription: l.description || undefined,
    unitAmount: l.unit_price ?? undefined,
    unitQuantity: l.quantity != null ? Math.round(l.quantity) : undefined,
    totalAmount: l.amount ?? undefined,
  }))
}

export function transformPurchaseOrder(raw: RampPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.vendor?.id || undefined,
    currency: raw.amount?.currency_code || undefined,
    totalAmount: raw.amount?.amount ?? undefined,
    lineItems: raw.line_items ? mapLines(raw.line_items) : undefined,
    postedAt: raw.start_date ? new Date(raw.start_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
