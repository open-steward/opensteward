import { toCalendarDate } from '../../shared/transform'
/**
 * Invoice Ninja v5 quote → canonical SalesOrder.
 *
 * Endpoint: GET /api/v1/quotes
 * Single:   GET /api/v1/quotes/{id}
 *
 * Invoice Ninja "quotes" are the closest match to SalesOrders.
 * Status IDs: 1=Draft, 2=Sent, 3=Approved, 4=Converted, 5=Expired
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import { currencyIdToIso } from '../constants'

export interface InvoiceNinjaQuoteLineItem {
  product_key?: string | null
  notes?: string | null
  cost?: number | null
  quantity?: number | null
  discount?: number | null
  line_total?: number | null
  [key: string]: unknown
}

export interface InvoiceNinjaQuote {
  id: string
  status_id?: number | null
  number?: string | null
  client_id?: string | null
  amount?: number | null
  currency_id?: string | null
  date?: string | null
  due_date?: string | null
  public_notes?: string | null
  line_items?: InvoiceNinjaQuoteLineItem[] | null
  updated_at?: number | null
  created_at?: number | null
  [key: string]: unknown
}

const QUOTE_STATUS_MAP: Record<number, SalesOrderStatus> = {
  1: 'DRAFT',
  2: 'ACTIVE',
  3: 'ACTIVE',
  4: 'COMPLETED',
  5: 'CANCELLED',
}

function mapStatus(statusId?: number | null): SalesOrderStatus {
  if (!statusId) return 'DRAFT'
  return QUOTE_STATUS_MAP[statusId] ?? 'ACTIVE'
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

function mapLineItem(li: InvoiceNinjaQuoteLineItem): Lineitem {
  return {
    itemId: li.product_key || undefined,
    itemDescription: li.notes || undefined,
    unitAmount: li.cost ?? undefined,
    unitQuantity: li.quantity != null ? Math.round(li.quantity) : undefined,
    discountAmount: li.discount || undefined,
    totalAmount: li.line_total ?? undefined,
  }
}

export function transformSalesOrder(raw: InvoiceNinjaQuote): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status_id),
    contactId: raw.client_id || undefined,
    currency: currencyIdToIso(raw.currency_id),
    totalAmount: raw.amount ?? undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: parseDateStr(raw.date),
    createdAt: parseEpoch(raw.created_at),
    updatedAt: parseEpoch(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/** Canonical SalesOrder → Invoice Ninja quote body (for create) */
export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    client_id: order.contactId,
    date: toCalendarDate(order.postedAt),
    line_items: order.lineItems?.map((li) => ({
      product_key: li.itemId,
      notes: li.itemDescription,
      cost: li.unitAmount,
      quantity: li.unitQuantity,
    })),
  }
}
