import type { Order, OrderStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * An order as returned by Routific's Platform API "Fetch order"
 * (GET https://api.plan.routific.com/v2/orders/{orderUuid},
 * https://api-docs.routific.com/reference/fetch-order.md). Only the fields in
 * that page's sample response and field table are declared.
 */
export interface RoutificOrder {
  uuid: string
  name?: string | null
  email?: string | null
  phone?: string | null
  load?: number | null
  duration?: number | null
  instructions?: string | null
  createdOn?: string | null
  customerOrderNumber?: string | null
  routificOrderNumber?: string | null
  timeWindows?: Array<{ startTime?: string | null; endTime?: string | null }> | null
  locations?: Array<{
    address?: string | null
    latitude?: number | null
    longitude?: number | null
    timezone?: string | null
    status?: string | null
  }> | null
  workspaceId?: number | null
  /** "Possible values: not\_scheduled, scheduled, delivered, missed." */
  status?: string | null
  deliveryDate?: string | null
  deliveryMissedReason?: string | null
  /** "The timestamp of the delivery attempt or completion." */
  deliveryTime?: string | null
  packages?: Array<{ barcode?: string | null }> | null
  tags?: string[] | null
  customFields?: Record<string, string> | null
  deliveryTracking?: { url?: string | null; shortUrl?: string | null } | null
  proofOfDelivery?: { signature?: string | null; photos?: string[] | null } | null
}

function mapStatus(s: string | null | undefined): OrderStatus {
  switch (s) {
    case 'not_scheduled':
      return 'PENDING'
    case 'scheduled':
      return 'AWAITING_SHIPMENT'
    case 'delivered':
      return 'DELIVERED'
    // 'missed' is a failed delivery attempt; the canonical enum has no such
    // state, and it is not a return. The raw value stays in metadata.
    default:
      return 'unknown'
  }
}

function opt(v: string | null | undefined): string | undefined {
  return v === null || v === undefined || v === '' ? undefined : v
}

function toDestination(raw: RoutificOrder): Address | undefined {
  const first = Array.isArray(raw.locations) ? raw.locations[0] : undefined
  // Routific's location carries one free-text `address`; it has no separate
  // city, postal code or country, so none is guessed from it.
  const addr: Address = {
    name: opt(raw.name),
    street1: opt(first?.address),
    phone: opt(raw.phone),
    email: opt(raw.email),
  }
  const defined = Object.fromEntries(
    Object.entries(addr).filter(([, v]) => v !== undefined),
  ) as Address
  return Object.keys(defined).length > 0 ? defined : undefined
}

export function transformOrder(raw: RoutificOrder): Order {
  if (typeof raw.uuid !== 'string' || raw.uuid === '') {
    throw new Error('routific: order payload has no uuid')
  }
  return {
    id: raw.uuid,
    status: mapStatus(raw.status),
    // "The internal Routific order number (as displayed in the UI)."
    orderNumber: opt(raw.routificOrderNumber),
    destinationAddress: toDestination(raw),
    notes: opt(raw.instructions),
    deliveredAt: raw.status === 'delivered' ? toISODate(raw.deliveryTime) : undefined,
    createdAt: toISODate(raw.createdOn),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
