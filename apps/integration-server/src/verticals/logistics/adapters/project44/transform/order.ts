import type { Order } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

export interface Project44OrderAddress {
  city?: string
  state?: string
  postalCode?: string
  country?: string
  addressLines?: string[]
  [key: string]: unknown
}

export interface Project44Order {
  id?: string
  description?: string
  orderIds?: string[]
  shipmentIds?: string[]
  status?: string
  originAddress?: Project44OrderAddress
  destinationAddress?: Project44OrderAddress
  createdDateTime?: string
  updatedDateTime?: string
  [key: string]: unknown
}

export interface Project44OrdersSearchResponse {
  orders?: Project44Order[]
  results?: Project44Order[]
  totalCount?: number
  /** InventoryOrderPage.paginationInfo; `total` counts every matching order. */
  paginationInfo?: { pageNumber?: number; pageSize?: number; total?: number }
  [key: string]: unknown
}

function mapOrderStatus(status: string | undefined): Order['status'] {
  switch (status?.toUpperCase()) {
    case 'PENDING':
      return 'PENDING'
    case 'PROCESSING':
      return 'PROCESSING'
    case 'ON_HOLD':
      return 'ON_HOLD'
    case 'AWAITING_SHIPMENT':
    case 'AWAITING_PICKUP':
      return 'AWAITING_SHIPMENT'
    case 'SHIPPED':
    case 'IN_TRANSIT':
      return 'SHIPPED'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELLED':
    case 'CANCELED':
      return 'CANCELLED'
    case 'RETURNED':
      return 'RETURNED'
    default:
      return 'PENDING'
  }
}

function toAddress(raw: Project44OrderAddress | undefined): Order['destinationAddress'] {
  if (!raw) return undefined
  const lines = raw.addressLines ?? []
  const hasAny = lines.length > 0 || raw.city || raw.state || raw.postalCode || raw.country
  if (!hasAny) return undefined
  return {
    street1: lines[0] ?? undefined,
    street2: lines[1] ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.country ?? undefined,
  }
}

export function transformOrder(raw: Project44Order): Order {
  return {
    id: raw.id ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.orderIds?.[0] ?? undefined,
    shipmentIds: raw.shipmentIds ?? undefined,
    originAddress: toAddress(raw.originAddress),
    destinationAddress: toAddress(raw.destinationAddress),
    notes: raw.description ?? undefined,
    createdAt: toISODate(raw.createdDateTime),
    updatedAt: toISODate(raw.updatedDateTime),
    metadata: raw as Record<string, unknown>,
  }
}
