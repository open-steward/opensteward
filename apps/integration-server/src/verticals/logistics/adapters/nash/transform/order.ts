import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

export interface NashOrder {
  id?: string | null
  createdAt?: string | null
  status?: string | null
  externalId?: string | null
  referenceId?: string | null
  pickupAddress?: string | null
  pickupAddressCity?: string | null
  pickupAddressState?: string | null
  pickupAddressZip?: string | null
  pickupAddressCountry?: string | null
  pickupLat?: number | null
  pickupLng?: number | null
  dropoffAddress?: string | null
  dropoffAddressCity?: string | null
  dropoffAddressState?: string | null
  dropoffAddressZip?: string | null
  dropoffAddressCountry?: string | null
  dropoffLat?: number | null
  dropoffLng?: number | null
  pickupStartTime?: string | null
  dropoffStartTime?: string | null
  itemsCount?: number | null
  currency?: string | null
  valueCents?: number | null
  pickupStoreLocationId?: string | null
  orderMetadata?: Record<string, unknown> | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): OrderStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'valid':
    case 'needs_attention':
      return 'PENDING'
    case 'dispatched':
      return 'PROCESSING'
    case 'archived':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

export function transformOrder(raw: NashOrder): Order {
  return {
    id: raw.id ?? undefined,
    status: mapStatus(raw.status),
    orderNumber: raw.referenceId ?? raw.externalId ?? undefined,
    warehouseId: raw.pickupStoreLocationId ?? undefined,
    currency: raw.currency ?? undefined,
    totalAmount: raw.valueCents != null ? raw.valueCents / 100 : undefined,
    originAddress: raw.pickupAddress
      ? {
          street1: raw.pickupAddress ?? undefined,
          city: raw.pickupAddressCity ?? undefined,
          state: raw.pickupAddressState ?? undefined,
          postalCode: raw.pickupAddressZip ?? undefined,
          country: raw.pickupAddressCountry ?? undefined,
        }
      : undefined,
    destinationAddress: raw.dropoffAddress
      ? {
          street1: raw.dropoffAddress ?? undefined,
          city: raw.dropoffAddressCity ?? undefined,
          state: raw.dropoffAddressState ?? undefined,
          postalCode: raw.dropoffAddressZip ?? undefined,
          country: raw.dropoffAddressCountry ?? undefined,
        }
      : undefined,
    orderAt: toISODate(raw.pickupStartTime ?? raw.createdAt),
    shippedAt: toISODate(raw.dropoffStartTime),
    createdAt: toISODate(raw.createdAt),
    metadata: raw as Record<string, unknown>,
  }
}
