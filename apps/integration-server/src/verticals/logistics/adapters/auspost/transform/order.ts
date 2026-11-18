import type { Order } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

export interface AusPostOrderShipmentResponse {
  shipment_id: string
  shipment_reference?: string
  shipment_creation_date?: string
  [key: string]: unknown
}

export interface AusPostOrderSummary {
  total_cost?: number
  total_gst?: number
  status?: string
  number_of_shipments?: number
  [key: string]: unknown
}

export interface AusPostOrderResponse {
  order_id: string
  order_reference?: string
  order_creation_date?: string
  order_summary?: AusPostOrderSummary
  shipments?: AusPostOrderShipmentResponse[]
  payment_method?: string
  [key: string]: unknown
}

export interface AusPostCreateOrderResponse {
  order: AusPostOrderResponse
  [key: string]: unknown
}

function mapOrderStatus(status: string | undefined): Order['status'] {
  if (!status) return undefined
  const s = status.toUpperCase()
  if (s === 'INITIATED' || s === 'CREATED') return 'PENDING'
  if (s === 'LODGED' || s === 'IN_TRANSIT') return 'AWAITING_SHIPMENT'
  if (s === 'DELIVERED') return 'DELIVERED'
  if (s === 'CANCELLED' || s === 'DELETED') return 'CANCELLED'
  return undefined
}

export function transformOrder(raw: AusPostOrderResponse): Order {
  const shipmentIds = (raw.shipments ?? []).map((s) => s.shipment_id).filter(Boolean)
  return {
    id: raw.order_id,
    orderNumber: raw.order_reference ?? raw.order_id,
    status: mapOrderStatus(raw.order_summary?.status),
    shipmentIds: shipmentIds.length > 0 ? shipmentIds : undefined,
    totalAmount:
      raw.order_summary?.total_cost != null
        ? Math.round(raw.order_summary.total_cost * 100)
        : undefined,
    taxAmount:
      raw.order_summary?.total_gst != null
        ? Math.round(raw.order_summary.total_gst * 100)
        : undefined,
    currency: 'AUD',
    createdAt: toISODate(raw.order_creation_date),
    metadata: raw as Record<string, unknown>,
  }
}
