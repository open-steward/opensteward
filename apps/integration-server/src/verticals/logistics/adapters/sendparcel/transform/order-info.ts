import type { Order, OrderStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'

/**
 * `POST /rest-api/orders/infos` ("Information about specific order") 200 body,
 * field for field from the spec embedded in https://api.sendparcel.com/rest-api/doc.
 */
export interface SendParcelOrderInfoParty {
  name?: string
  company?: string
  address1?: string
  address2?: string
  city?: string
  state?: string
  postal_code?: string
  phone?: string
  /** "Country, ISO 3166-1 alpha-2 code" */
  country?: string
}

export interface SendParcelOrderInfoParcel {
  weight?: number
  length?: number
  width?: number
  height?: number
}

export interface SendParcelOrderInfo {
  /** "Order ID" (a string in the response, an integer in the request) */
  id?: string
  /** "Order status, 0 - Ongoing, 1 - Waiting, 2 - Completed, 3 - Ongoing manually, 4 - Cancelled" */
  status?: 0 | 1 | 2 | 3 | 4
  tracking_number?: string
  /** "Created order date, format: yyyy-mm-dd hh:mm:ss" (no time zone) */
  created_date?: string
  shipper?: SendParcelOrderInfoParty
  recipient?: SendParcelOrderInfoParty
  parcels?: SendParcelOrderInfoParcel[]
}

/**
 * Only the documented codes with an unambiguous canonical match are mapped.
 * "2 - Completed" does not say whether the parcel was delivered or only
 * handed to the courier, so it stays 'unknown' and the raw code is kept in
 * metadata.
 */
function mapStatus(status: SendParcelOrderInfo['status']): OrderStatus | undefined {
  switch (status) {
    case 0:
    case 3:
      return 'PROCESSING'
    case 1:
      return 'PENDING'
    case 4:
      return 'CANCELLED'
    case 2:
      return 'unknown'
    default:
      return undefined
  }
}

function toAddress(party: SendParcelOrderInfoParty | undefined): Address | undefined {
  if (!party) return undefined
  return {
    name: party.name || undefined,
    company: party.company || undefined,
    street1: party.address1 || undefined,
    street2: party.address2 || undefined,
    city: party.city || undefined,
    state: party.state || undefined,
    postalCode: party.postal_code || undefined,
    phone: party.phone || undefined,
    country: party.country || undefined,
  }
}

/**
 * `created_date` carries no time zone, so it is not turned into `createdAt`
 * (that would mean guessing one); it stays in metadata with the rest of the
 * body. The tracking number and parcels have no Order field and live there too.
 */
export function transformOrderInfo(raw: SendParcelOrderInfo): Order {
  return {
    id: raw.id || undefined,
    status: mapStatus(raw.status),
    originAddress: toAddress(raw.shipper),
    destinationAddress: toAddress(raw.recipient),
    metadata: raw as Record<string, unknown>,
  }
}
