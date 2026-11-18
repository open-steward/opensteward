import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate, nonempty } from '../../shared/transform'

export interface ExtensivOrderItem {
  sku: string
  quantity: number
  description?: string | null
  unitPrice?: number | null
  [key: string]: unknown
}

export interface ExtensivOrder {
  orderId: string | number
  referenceNum?: string | null
  status?: string | null
  customerId?: string | number | null
  warehouseId?: string | number | null
  shipToAddress?: Record<string, unknown> | null
  shipFromAddress?: Record<string, unknown> | null
  items?: ExtensivOrderItem[]
  shipmentIds?: Array<string | number>
  notes?: string | null
  requestedServiceCode?: string | null
  orderDate?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status) {
    case 'Open':
    case 'Pending':           return 'PENDING'
    case 'Processing':
    case 'In Process':        return 'PROCESSING'
    case 'On Hold':           return 'ON_HOLD'
    case 'Awaiting Shipment': return 'AWAITING_SHIPMENT'
    case 'Shipped':           return 'SHIPPED'
    case 'Delivered':         return 'DELIVERED'
    case 'Cancelled':         return 'CANCELLED'
    case 'Returned':          return 'RETURNED'
    default:                  return 'PENDING'
  }
}

export function transformOrder(raw: ExtensivOrder): Order {
  const shipmentIds = nonempty((raw.shipmentIds ?? []).map((s) => String(s)))

  const lineItems = nonempty(
    (raw.items ?? []).map((item) => ({
      sku: item.sku,
      quantity: item.quantity,
      description: item.description ?? undefined,
      unitAmount: item.unitPrice ?? undefined,
    })),
  )

  return {
    id: String(raw.orderId),
    status: mapOrderStatus(raw.status),
    orderNumber: raw.referenceNum ?? undefined,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    warehouseId: raw.warehouseId != null ? String(raw.warehouseId) : undefined,
    originAddress: toAddress(raw.shipFromAddress),
    destinationAddress: toAddress(raw.shipToAddress),
    shipmentIds,
    lineItems,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.requestedServiceCode ?? undefined,
    orderAt: toISODate(raw.orderDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
