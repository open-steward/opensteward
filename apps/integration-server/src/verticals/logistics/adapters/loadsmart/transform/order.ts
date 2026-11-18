import type { Order } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * Shape of a stop object in the Loadsmart orders API.
 * Loadsmart orders have pickup and delivery stops with address info.
 * Confirmed from developer.loadsmart.com/docs/shipperguide/for-shippers/create-orders/
 */
export interface LoadsmartOrderStop {
  facilityName?: string
  addressLine?: string
  city?: string
  state?: string
  country?: string
  zipCode?: string
  contactName?: string
  contactEmail?: string
  contactPhone?: string
  facilityExternalId?: string
  [key: string]: unknown
}

export interface LoadsmartOrderItem {
  lineNumber?: number
  quantity?: number
  packageType?: string
  weight?: number
  commodity?: string
  freightClass?: number
  itemId?: string
  itemDescription?: string
  [key: string]: unknown
}

/**
 * Shape returned by POST /orders/ and PUT /orders/{order_uuid}.
 * Confirmed from developer.loadsmart.com/docs/shipperguide/overview/api-rate-limits
 * and developer.loadsmart.com/docs/shipperguide/for-shippers/create-orders/
 */
export interface LoadsmartOrderResponse {
  uuid?: string
  externalId?: string
  primaryReference?: string
  poNumber?: string
  soNumber?: string
  movement?: string
  status?: string
  pickup?: LoadsmartOrderStop
  delivery?: LoadsmartOrderStop
  items?: LoadsmartOrderItem[]
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function stopToAddress(stop: LoadsmartOrderStop | undefined): Address | undefined {
  if (!stop) return undefined
  const hasAny =
    stop.addressLine || stop.city || stop.state || stop.zipCode || stop.country || stop.facilityName
  if (!hasAny) return undefined
  return {
    name: stop.contactName ?? undefined,
    company: stop.facilityName ?? undefined,
    street1: stop.addressLine ?? undefined,
    city: stop.city ?? undefined,
    state: stop.state ?? undefined,
    postalCode: stop.zipCode ?? undefined,
    country: stop.country ?? undefined,
    phone: stop.contactPhone ?? undefined,
    email: stop.contactEmail ?? undefined,
  }
}

export function transformOrder(raw: LoadsmartOrderResponse): Order {
  return {
    id: raw.uuid ?? raw.externalId ?? undefined,
    orderNumber: raw.primaryReference ?? raw.poNumber ?? raw.soNumber ?? undefined,
    originAddress: stopToAddress(raw.pickup),
    destinationAddress: stopToAddress(raw.delivery),
    notes: (raw as Record<string, unknown>).notes as string | undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
