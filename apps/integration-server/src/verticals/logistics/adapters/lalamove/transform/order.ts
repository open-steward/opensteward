import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate, parseDecimal } from '../../shared/transform'

// ─── Lalamove raw types ────────────────────────────────────────────────────

export interface LalamoveStop {
  address: string | null
  coordinates?: { lat: string | null; lng: string | null } | null
  name?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface LalamovePriceBreakdown {
  base?: string | null
  totalExcludePriorityFee?: string | null
  total?: string | null
  currency?: string | null
  [key: string]: unknown
}

export interface LalamoveOrderDetail {
  orderId: string
  quotationId?: string | null
  status: string | null
  stops?: LalamoveStop[] | null
  priceBreakdown?: LalamovePriceBreakdown | null
  driverId?: string | null
  shareLink?: string | null
  distance?: { value: number | null; unit: string | null } | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null): OrderStatus {
  switch (status) {
    case 'ASSIGNING_DRIVER': return 'PROCESSING'
    case 'ON_GOING':         return 'PROCESSING'
    case 'PICKED_UP':        return 'PROCESSING'
    case 'COMPLETED':        return 'DELIVERED'
    case 'CANCELLED':        return 'CANCELLED'
    case 'EXPIRED':          return 'CANCELLED'
    case 'REJECTED':         return 'CANCELLED'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: LalamoveOrderDetail): Order {
  const stops = raw.stops ?? []
  const originStop = stops[0]
  const destinationStop = stops[stops.length - 1]

  const total = parseDecimal(raw.priceBreakdown?.total)
  const currency = raw.priceBreakdown?.currency ?? 'USD'

  return {
    id: raw.orderId,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.orderId,
    shipmentIds: raw.orderId ? [raw.orderId] : undefined,
    originAddress: originStop?.address
      ? { street1: originStop.address, name: originStop.name ?? undefined, phone: originStop.phone ?? undefined }
      : undefined,
    destinationAddress: destinationStop?.address && destinationStop !== originStop
      ? { street1: destinationStop.address, name: destinationStop.name ?? undefined, phone: destinationStop.phone ?? undefined }
      : undefined,
    currency: currency !== 'USD' ? (currency as Order['currency']) : 'USD',
    totalAmount: total,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
