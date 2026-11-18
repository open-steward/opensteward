import type { Order, OrderStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ─── Bring raw types ────────────────────────────────────────────────────────

export interface BringOrderPartyAddress {
  streetAddress?: string | null
  streetAddress2?: string | null
  city?: string | null
  postalCode?: string | null
  countryCode?: string | null
  [key: string]: unknown
}

export interface BringOrderParty {
  name?: string | null
  contactName?: string | null
  email?: string | null
  phone?: string | null
  address?: BringOrderPartyAddress | null
  [key: string]: unknown
}

export interface BringOrderLine {
  articleName?: string | null
  articleNumber?: string | null
  quantity?: number | null
  unitPrice?: number | null
  unitPriceCurrency?: string | null
  [key: string]: unknown
}

export interface BringOrderResponse {
  orderId?: string | null
  orderStatus?: string | null
  orderNumber?: string | null
  customerId?: string | null
  supplierParty?: BringOrderParty | null
  orderingParty?: BringOrderParty | null
  deliveryParty?: BringOrderParty | null
  orderLines?: BringOrderLine[] | null
  requestedDeliveryDate?: string | null
  estimatedDeliveryDate?: string | null
  actualDeliveryDate?: string | null
  createdDate?: string | null
  updatedDate?: string | null
  currency?: string | null
  [key: string]: unknown
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PENDING':
      return 'PENDING'
    case 'PROCESSING':
    case 'IN_PROGRESS':
      return 'PROCESSING'
    case 'ON_HOLD':
      return 'ON_HOLD'
    case 'AWAITING_SHIPMENT':
    case 'READY_FOR_SHIPPING':
      return 'AWAITING_SHIPMENT'
    case 'SHIPPED':
    case 'DISPATCHED':
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

function mapPartyToAddress(
  party: BringOrderParty | null | undefined,
): Address | undefined {
  if (!party) return undefined
  const addr = party.address
  return {
    name: party.name ?? party.contactName ?? undefined,
    street1: addr?.streetAddress ?? undefined,
    street2: addr?.streetAddress2 ?? undefined,
    city: addr?.city ?? undefined,
    postalCode: addr?.postalCode ?? undefined,
    country: addr?.countryCode ?? undefined,
    email: party.email ?? undefined,
    phone: party.phone ?? undefined,
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: BringOrderResponse): Order {
  return {
    id: raw.orderId ?? undefined,
    status: mapOrderStatus(raw.orderStatus),
    orderNumber: raw.orderNumber ?? undefined,
    customerId: raw.customerId ?? undefined,
    originAddress: mapPartyToAddress(raw.supplierParty ?? raw.orderingParty),
    destinationAddress: mapPartyToAddress(raw.deliveryParty),
    currency: raw.currency as Order['currency'] ?? undefined,
    orderAt: toISODate(raw.createdDate),
    shippedAt: toISODate(raw.estimatedDeliveryDate),
    deliveredAt: toISODate(raw.actualDeliveryDate),
    createdAt: toISODate(raw.createdDate),
    updatedAt: toISODate(raw.updatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
