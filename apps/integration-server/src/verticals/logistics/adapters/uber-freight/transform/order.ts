/**
 * Uber Freight order transform.
 *
 * Uber Freight is a freight brokerage marketplace — its core entity is a
 * "load" (a.k.a. tender), represented via the /shipments resource. There is
 * no separate /orders endpoint; instead, a tendered load maps directly onto
 * the canonical Order schema.
 *
 * Source endpoint: GET /shipments  (list)  /  GET /shipments/{id}  (get)
 * Docs:            https://developer.uberfreight.com  (behind registration)
 */
import type { Order, OrderStatus } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

export interface UberFreightOrderRaw {
  id: string
  referenceNumber?: string | null
  serviceType?: string | null
  status?: string | null
  originCity?: string | null
  originState?: string | null
  originZipCode?: string | null
  originCountry?: string | null
  destinationCity?: string | null
  destinationState?: string | null
  destinationZipCode?: string | null
  destinationCountry?: string | null
  totalPrice?: number | null
  currency?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

const STATUS_MAP: Record<string, OrderStatus> = {
  PENDING: 'PENDING',
  BOOKED: 'PROCESSING',
  DISPATCHED: 'PROCESSING',
  IN_TRANSIT: 'SHIPPED',
  AT_DELIVERY: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
}

function mapStatus(raw: string | null | undefined): OrderStatus | undefined {
  if (!raw) return undefined
  return STATUS_MAP[raw] ?? 'PROCESSING'
}

export function transformOrder(raw: UberFreightOrderRaw): Order {
  const originAddress =
    raw.originCity || raw.originState || raw.originZipCode || raw.originCountry
      ? {
          city: raw.originCity ?? undefined,
          state: raw.originState ?? undefined,
          postalCode: raw.originZipCode ?? undefined,
          country: raw.originCountry ?? undefined,
        }
      : undefined

  const destinationAddress =
    raw.destinationCity || raw.destinationState || raw.destinationZipCode || raw.destinationCountry
      ? {
          city: raw.destinationCity ?? undefined,
          state: raw.destinationState ?? undefined,
          postalCode: raw.destinationZipCode ?? undefined,
          country: raw.destinationCountry ?? undefined,
        }
      : undefined

  return {
    id: raw.id,
    orderNumber: raw.referenceNumber ?? undefined,
    status: mapStatus(raw.status),
    requestedServiceCode: raw.serviceType ?? undefined,
    originAddress,
    destinationAddress,
    currency: (raw.currency as string | undefined) ?? 'USD',
    totalAmount: raw.totalPrice ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
