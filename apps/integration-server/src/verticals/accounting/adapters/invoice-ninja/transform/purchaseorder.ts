import { toCalendarDate } from '../../shared/transform'
/**
 * Invoice Ninja v5 purchase order transforms.
 *
 * Endpoint: GET /api/v1/purchase_orders
 * Single:   GET /api/v1/purchase_orders/{id}
 *
 * Status IDs: 1=Draft, 2=Sent, 3=Accepted, 4=Received, 5=Cancelled
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'
import { currencyIdToIso } from '../constants'

export interface InvoiceNinjaPurchaseOrderLineItem {
  product_key?: string | null
  notes?: string | null
  cost?: number | null
  quantity?: number | null
  discount?: number | null
  line_total?: number | null
  [key: string]: unknown
}

export interface InvoiceNinjaPurchaseOrder {
  id: string
  status_id?: number | null
  number?: string | null
  vendor_id?: string | null
  amount?: number | null
  balance?: number | null
  currency_id?: string | null
  date?: string | null
  due_date?: string | null
  public_notes?: string | null
  line_items?: InvoiceNinjaPurchaseOrderLineItem[] | null
  updated_at?: number | null
  created_at?: number | null
  [key: string]: unknown
}

const PO_STATUS_MAP: Record<number, PurchaseOrderStatus> = {
  1: 'DRAFT',
  2: 'ACTIVE',
  3: 'ACTIVE',
  4: 'COMPLETED',
  5: 'CANCELLED',
}

function mapStatus(statusId?: number | null): PurchaseOrderStatus {
  if (!statusId) return 'DRAFT'
  return PO_STATUS_MAP[statusId] ?? 'ACTIVE'
}

function parseDateStr(s?: string | null): Date | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return isNaN(d.getTime()) ? undefined : d
}

function parseEpoch(n?: number | null): Date | undefined {
  if (!n) return undefined
  return new Date(n * 1000)
}

function mapLineItem(li: InvoiceNinjaPurchaseOrderLineItem): Lineitem {
  return {
    itemId: li.product_key || undefined,
    itemDescription: li.notes || undefined,
    unitAmount: li.cost ?? undefined,
    unitQuantity: li.quantity != null ? Math.round(li.quantity) : undefined,
    discountAmount: li.discount || undefined,
    totalAmount: li.line_total ?? undefined,
  }
}

export function transformPurchaseOrder(raw: InvoiceNinjaPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status_id),
    contactId: raw.vendor_id || undefined,
    currency: currencyIdToIso(raw.currency_id),
    totalAmount: raw.amount ?? undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: parseDateStr(raw.date),
    createdAt: parseEpoch(raw.created_at),
    updatedAt: parseEpoch(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical PurchaseOrder → Invoice Ninja body (for create) */
export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    vendor_id: order.contactId,
    date: toCalendarDate(order.postedAt),
    line_items: order.lineItems?.map((li) => ({
      product_key: li.itemId,
      notes: li.itemDescription,
      cost: li.unitAmount,
      quantity: li.unitQuantity,
    })),
  }
}
