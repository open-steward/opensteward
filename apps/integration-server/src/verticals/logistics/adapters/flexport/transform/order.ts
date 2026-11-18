import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'

export interface FlexportOrderAddressRaw {
  street_address?: string
  city?: string
  state?: string
  zip?: string
  country_code?: string
  [key: string]: unknown
}

export interface FlexportOrderLineItemRaw {
  id?: string
  sku?: string
  description?: string
  quantity?: number
  unit_price?: number
  total_price?: number
  [key: string]: unknown
}

export interface FlexportOrderResponse {
  id?: string
  order_number?: string
  status?: string
  customer_id?: string
  warehouse_id?: string
  shipment_ids?: string[]
  origin?: FlexportOrderAddressRaw
  destination?: FlexportOrderAddressRaw
  line_items?: FlexportOrderLineItemRaw[]
  currency?: string
  total?: number
  notes?: string
  service_type?: string
  order_date?: string
  shipped_date?: string
  delivered_date?: string
  cancelled_date?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

const STATUS_MAP: Record<string, OrderStatus> = {
  pending: 'PENDING',
  processing: 'PROCESSING',
  awaiting_shipment: 'AWAITING_SHIPMENT',
  in_transit: 'SHIPPED',
  shipped: 'SHIPPED',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
}

function mapStatus(raw: string | undefined): OrderStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw.toLowerCase()] ?? undefined
}

function toOrderAddress(raw: FlexportOrderAddressRaw | undefined) {
  if (!raw) return undefined
  return toAddress({
    street1: raw.street_address,
    city: raw.city,
    state: raw.state,
    postalCode: raw.zip,
    country: raw.country_code,
  })
}

export function transformOrder(raw: FlexportOrderResponse): Order {
  const lineItems = (raw.line_items ?? []).map((li) => ({
    id: li.id ?? undefined,
    sku: li.sku ?? undefined,
    description: li.description ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: li.unit_price != null ? Math.round(li.unit_price * 100) : undefined,
    totalAmount: li.total_price != null ? Math.round(li.total_price * 100) : undefined,
  }))

  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw.status),
    orderNumber: raw.order_number ?? undefined,
    customerId: raw.customer_id != null ? String(raw.customer_id) : undefined,
    warehouseId: raw.warehouse_id != null ? String(raw.warehouse_id) : undefined,
    shipmentIds: raw.shipment_ids ?? undefined,
    originAddress: toOrderAddress(raw.origin),
    destinationAddress: toOrderAddress(raw.destination),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? undefined,
    totalAmount: raw.total != null ? Math.round(raw.total * 100) : undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.service_type ?? undefined,
    orderAt: toISODate(raw.order_date),
    shippedAt: toISODate(raw.shipped_date),
    deliveredAt: toISODate(raw.delivered_date),
    cancelledAt: toISODate(raw.cancelled_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
