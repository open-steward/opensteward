import type { Order, OrderStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface BlueYonderOrderAddress {
  name?: string
  street1?: string
  street2?: string
  city?: string
  state?: string
  postalCode?: string
  country?: string
  [key: string]: unknown
}

export interface BlueYonderOrderLineItem {
  lineId?: string
  itemId?: string
  itemDescription?: string
  orderedQuantity?: number
  pickedQuantity?: number
  shippedQuantity?: number
  unitOfMeasure?: string
  [key: string]: unknown
}

export interface BlueYonderOrderResponse {
  orderId: string
  orderNumber?: string
  status?: string
  priority?: string
  requestedShipDate?: string
  shipToAddress?: BlueYonderOrderAddress
  lineItems?: BlueYonderOrderLineItem[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

const ORDER_STATUS_MAP: Record<string, OrderStatus> = {
  NEW: 'PENDING',
  PICKING: 'PROCESSING',
  PACKED: 'AWAITING_SHIPMENT',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
}

function mapOrderStatus(raw: string | undefined): OrderStatus {
  if (!raw) return 'PENDING'
  return ORDER_STATUS_MAP[raw.toUpperCase()] ?? 'PENDING'
}

function toShipAddress(addr: BlueYonderOrderAddress | undefined): Address | undefined {
  if (!addr) return undefined
  const hasAny = addr.name || addr.street1 || addr.city || addr.state || addr.postalCode || addr.country
  if (!hasAny) return undefined
  return {
    name: addr.name ?? undefined,
    street1: addr.street1 ?? undefined,
    street2: addr.street2 ?? undefined,
    city: addr.city ?? undefined,
    state: addr.state ?? undefined,
    postalCode: addr.postalCode ?? undefined,
    country: addr.country ?? undefined,
  }
}

export function transformOrder(raw: BlueYonderOrderResponse): Order {
  return {
    id: raw.orderId,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.orderNumber ?? undefined,
    destinationAddress: toShipAddress(raw.shipToAddress),
    orderAt: toISODate(raw.requestedShipDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
