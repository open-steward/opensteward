/**
 * Invoiced Estimate → canonical SalesOrder transform.
 *
 * Invoiced has no native "sales order" concept. Estimates (pre-invoice quotes
 * sent to customers) are the closest analogue.
 *
 * Estimate statuses: draft, not_sent, sent, approved, invoiced, declined, voided
 * Docs: https://developer.invoiced.com/api/estimates
 */
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import { type InvoicedEstimate, type InvoicedEstimateLineItem } from './order'

function mapStatus(raw: InvoicedEstimate): SalesOrderStatus {
  const s = raw.status
  if (s === 'voided' || s === 'declined') return 'CANCELLED'
  if (s === 'invoiced') return 'COMPLETED'
  if (s === 'draft') return 'DRAFT'
  // not_sent, sent, approved
  return 'ACTIVE'
}

function mapLineitem(li: InvoicedEstimateLineItem): Lineitem {
  return {
    id: String(li.id),
    itemId: li.catalog_item || undefined,
    itemName: li.name || undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.unit_cost,
    unitQuantity: li.quantity,
    totalAmount: li.amount,
  }
}

export function transformSalesOrder(raw: InvoicedEstimate): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.customer ? String(raw.customer) : undefined,
    currency: raw.currency ? raw.currency.toUpperCase() : undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date * 1000) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at * 1000) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at * 1000) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
