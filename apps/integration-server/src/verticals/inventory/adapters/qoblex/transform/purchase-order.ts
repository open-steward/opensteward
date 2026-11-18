/**
 * Transform a Qoblex purchase order into canonical PurchaseOrder.
 *
 * Source: GET /v1/purchase_orders and GET /v1/purchase_orders/{id}
 * Schema: Qoblex.Api.Purchases.Dto.GetPurchaseOrderDto
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawQoblexPurchaseOrderLineItem {
  id?: number
  name?: string
  product_variant?: { id?: number; name?: string; sku?: string }
  quantity?: number
  price?: number
  discount?: number
  received_quantity?: number
  is_fully_received?: boolean
  [key: string]: unknown
}

export interface RawQoblexPurchaseOrder {
  id: number
  number?: string
  type?: string
  created_at?: string
  last_updated_at?: string
  due_date?: string
  status?: string
  billing_status?: string
  receiving_status?: string
  payment_status?: string
  supplier_id?: number
  ship_to_location_id?: number
  currency?: string
  currency_exchange_rate?: number
  is_tax_inclusive?: boolean
  line_items?: RawQoblexPurchaseOrderLineItem[]
  comments?: string
  tags?: string
  [key: string]: unknown
}

function mapStatus(status: string | undefined, receivingStatus: string | undefined): PurchaseOrderStatus {
  const s = (status ?? '').toLowerCase()
  const r = (receivingStatus ?? '').toLowerCase()
  if (s === 'draft') return 'draft'
  if (s === 'approved' && r === 'not_received') return 'sent'
  if (s === 'approved' && r === 'partially_received') return 'partially_received'
  if (s === 'approved' && r === 'received') return 'received'
  if (s === 'closed') return 'closed'
  if (s === 'cancelled' || s === 'voided') return 'cancelled'
  // fallback: use receiving status
  if (r === 'partially_received') return 'partially_received'
  if (r === 'received') return 'received'
  return 'draft'
}

export function transformPurchaseOrder(raw: RawQoblexPurchaseOrder): PurchaseOrder {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    number: pickStr(raw.number),
    supplierId: raw.supplier_id !== undefined ? String(raw.supplier_id) : '',
    destinationLocationId: raw.ship_to_location_id !== undefined ? String(raw.ship_to_location_id) : undefined,
    status: mapStatus(raw.status, raw.receiving_status),
    currency: pickStr(raw.currency),
    lines: (raw.line_items ?? []).map((l) => ({
      productId: l.product_variant?.id !== undefined ? String(l.product_variant.id) : '',
      quantityOrdered: l.quantity ?? 0,
      quantityReceived: l.received_quantity,
      unitCost: l.price,
    })),
    orderedAt: toIso(raw.created_at),
    expectedAt: toIso(raw.due_date),
    platform: 'qoblex',
    metadata: strMap({
      type: raw.type,
      billingStatus: raw.billing_status,
      paymentStatus: raw.payment_status,
      isTaxInclusive: raw.is_tax_inclusive,
      lastUpdatedAt: raw.last_updated_at,
    }),
    raw,
  }
}
