import type { Order } from '../../../schema/order'
import { toISODate } from '../../shared/transform'
import type { Address } from '../../../schema/shared'

// Ninja Van "order" is their core delivery order created via POST /{countryCode}/4.1/orders.
// The response mirrors the NinjaVanShipmentResponse but carries from/to address objects.

export interface NinjaVanOrderAddress {
  name?: string
  phone_number?: string
  email?: string
  address?: {
    address1?: string
    address2?: string
    city?: string
    state?: string
    postcode?: string
    country?: string
    [key: string]: unknown
  }
  [key: string]: unknown
}

export interface NinjaVanOrderResponse {
  tracking_number?: string
  id?: string
  status?: string
  service_type?: string
  service_level?: string
  from?: NinjaVanOrderAddress
  to?: NinjaVanOrderAddress
  requested_tracking_number?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function toAddress(raw: NinjaVanOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const addr = raw.address ?? {}
  return {
    name: raw.name ?? undefined,
    phone: raw.phone_number ?? undefined,
    email: raw.email ?? undefined,
    street1: addr.address1 ?? undefined,
    street2: addr.address2 ?? undefined,
    city: addr.city ?? undefined,
    state: addr.state ?? undefined,
    postalCode: addr.postcode ?? undefined,
    country: addr.country ?? undefined,
  }
}

export function transformOrder(raw: NinjaVanOrderResponse): Order {
  const trackingNumber = raw.tracking_number ?? raw.requested_tracking_number ?? raw.id

  return {
    id: raw.tracking_number ?? raw.id ?? undefined,
    orderNumber: trackingNumber,
    status: undefined,
    originAddress: toAddress(raw.from),
    destinationAddress: toAddress(raw.to),
    requestedServiceCode: raw.service_type ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
