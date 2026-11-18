import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, nonempty, parseDecimal } from '../../shared/transform'
import { transformAddress, type ChazkiAddress } from './address'

/**
 * Chazki order resource — represents an e-commerce order that may contain
 * one or more shipments/packages.
 */
export interface ChazkiOrder {
  id?: string | null
  code?: string | null
  reference?: string | null
  order_number?: string | null
  status?: string | null
  customer_id?: string | null
  origin?: ChazkiAddress | null
  destination?: ChazkiAddress | null
  sender?: ChazkiAddress | null
  receiver?: ChazkiAddress | null
  shipment_ids?: string[] | null
  packages?: Array<{ id?: string | null }> | null
  currency?: string | null
  subtotal?: number | null
  tax?: number | null
  shipping_cost?: number | null
  discount?: number | null
  total?: number | null
  total_amount?: number | null
  notes?: string | null
  service?: string | null
  order_date?: string | null
  shipped_at?: string | null
  delivered_at?: string | null
  cancelled_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pendiente':
    case 'pending':
      return 'PENDING'
    case 'procesando':
    case 'processing':
      return 'PROCESSING'
    case 'en_espera':
    case 'on_hold':
      return 'ON_HOLD'
    case 'listo_para_envio':
    case 'awaiting_shipment':
      return 'AWAITING_SHIPMENT'
    case 'enviado':
    case 'shipped':
      return 'SHIPPED'
    case 'entregado':
    case 'delivered':
      return 'DELIVERED'
    case 'cancelado':
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'devuelto':
    case 'returned':
      return 'RETURNED'
    default:
      return 'UNKNOWN'
  }
}

export function transformOrder(raw: ChazkiOrder): Order {
  const origin = raw.origin ?? raw.sender
  const destination = raw.destination ?? raw.receiver

  // Collect shipment IDs from either a dedicated array or nested packages.
  const rawShipmentIds = raw.shipment_ids ?? (raw.packages ?? []).map((p) => p.id).filter(Boolean) as string[]

  return {
    id: raw.id ?? raw.code ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.order_number ?? raw.reference ?? raw.code ?? undefined,
    customerId: raw.customer_id ?? undefined,
    originAddress: origin ? transformAddress(origin) : undefined,
    destinationAddress: destination ? transformAddress(destination) : undefined,
    shipmentIds: nonempty(rawShipmentIds.map(String)),
    currency: raw.currency ?? undefined,
    subtotalAmount: parseDecimal(raw.subtotal),
    taxAmount: parseDecimal(raw.tax),
    shippingAmount: parseDecimal(raw.shipping_cost),
    discountAmount: parseDecimal(raw.discount),
    totalAmount: parseDecimal(raw.total ?? raw.total_amount),
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.service ?? undefined,
    orderAt: toISODate(raw.order_date),
    shippedAt: toISODate(raw.shipped_at),
    deliveredAt: toISODate(raw.delivered_at),
    cancelledAt: toISODate(raw.cancelled_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
