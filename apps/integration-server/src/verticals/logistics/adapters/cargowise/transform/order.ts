import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, toAddress } from '../../shared/transform'

// CargoWise forwarding/purchase order as returned by GET /orders and GET /orders/:id

export interface CargowiseOrderAddressRaw {
  street?: string
  city?: string
  state?: string
  postCode?: string
  country?: string
  name?: string
  company?: string
  [key: string]: unknown
}

export interface CargowiseOrderLineItemRaw {
  lineId?: string
  sku?: string
  description?: string
  quantity?: number
  unitPrice?: number
  totalPrice?: number
  currency?: string
  [key: string]: unknown
}

export interface CargowiseOrderResponse {
  orderId?: string
  orderNumber?: string
  status?: string
  customerId?: string
  warehouseId?: string
  shipmentIds?: string[]
  origin?: CargowiseOrderAddressRaw
  destination?: CargowiseOrderAddressRaw
  lineItems?: CargowiseOrderLineItemRaw[]
  currency?: string
  subtotal?: number
  taxAmount?: number
  shippingAmount?: number
  discountAmount?: number
  total?: number
  notes?: string
  requestedServiceCode?: string
  orderDate?: string
  shippedDate?: string
  deliveredDate?: string
  cancelledDate?: string
  createdDate?: string
  lastUpdatedDate?: string
  [key: string]: unknown
}

export interface CargowiseOrdersListResponse {
  orders: CargowiseOrderResponse[]
  [key: string]: unknown
}

const STATUS_MAP: Record<string, OrderStatus> = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  ON_HOLD: 'ON_HOLD',
  AWAITING_SHIPMENT: 'AWAITING_SHIPMENT',
  SHIPPED: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
}

function mapStatus(raw: string | undefined): OrderStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw.toUpperCase()] ?? undefined
}

function toOrderAddress(raw: CargowiseOrderAddressRaw | undefined) {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.company,
    street1: raw.street,
    city: raw.city,
    state: raw.state,
    postalCode: raw.postCode,
    country: raw.country,
  })
}

export function transformOrder(raw: CargowiseOrderResponse): Order {
  const lineItems = (raw.lineItems ?? []).map((li) => ({
    id: li.lineId ?? undefined,
    sku: li.sku ?? undefined,
    description: li.description ?? undefined,
    quantity: li.quantity ?? undefined,
    unitAmount: li.unitPrice != null ? Math.round(li.unitPrice * 100) : undefined,
    totalAmount: li.totalPrice != null ? Math.round(li.totalPrice * 100) : undefined,
  }))

  return {
    id: raw.orderId != null ? String(raw.orderId) : undefined,
    status: mapStatus(raw.status),
    orderNumber: raw.orderNumber ?? undefined,
    customerId: raw.customerId != null ? String(raw.customerId) : undefined,
    warehouseId: raw.warehouseId != null ? String(raw.warehouseId) : undefined,
    shipmentIds: raw.shipmentIds ?? undefined,
    originAddress: toOrderAddress(raw.origin),
    destinationAddress: toOrderAddress(raw.destination),
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    currency: raw.currency ?? undefined,
    subtotalAmount: raw.subtotal != null ? Math.round(raw.subtotal * 100) : undefined,
    taxAmount: raw.taxAmount != null ? Math.round(raw.taxAmount * 100) : undefined,
    shippingAmount: raw.shippingAmount != null ? Math.round(raw.shippingAmount * 100) : undefined,
    discountAmount: raw.discountAmount != null ? Math.round(raw.discountAmount * 100) : undefined,
    totalAmount: raw.total != null ? Math.round(raw.total * 100) : undefined,
    notes: raw.notes ?? undefined,
    requestedServiceCode: raw.requestedServiceCode ?? undefined,
    orderAt: toISODate(raw.orderDate),
    shippedAt: toISODate(raw.shippedDate),
    deliveredAt: toISODate(raw.deliveredDate),
    cancelledAt: toISODate(raw.cancelledDate),
    createdAt: toISODate(raw.createdDate),
    updatedAt: toISODate(raw.lastUpdatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
