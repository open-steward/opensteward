import type { Order, OrderStatus } from '../../../schema/order'
import type { Address, Lineitem } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * An order as `GET /v2/orders/` (a bare array) and `GET /v2/orders/{order_id}/`
 * return it, schema ms_api__core_models__OrderModel
 * (https://kitchenhub.readme.io/reference/get_v2-orders-1.md; the Orders API
 * guide, https://kitchenhub.readme.io/reference/orders-api.md, gives the
 * example). Prices and charges are decimal strings with no currency anywhere
 * in the model, so no amount or currency is mapped.
 */
export interface KitchenHubOrderAddress {
  country?: string | null
  street?: string | null
  city?: string | null
  state?: string | null
  zipcode?: string | null
  unit_number?: string | null
  [key: string]: unknown
}

export interface KitchenHubOrderItem {
  id?: string | null
  name: string
  quantity: number
  price?: string | null
  [key: string]: unknown
}

export interface KitchenHubOrder {
  order: {
    id: number
    external_id?: string | null
    number?: string | null
    type?: string | null
    status?: string | null
    notes?: string | null
    [key: string]: unknown
  }
  provider?: { id: string; name?: string | null; [key: string]: unknown } | null
  store?: { id: string; name?: string | null; [key: string]: unknown } | null
  items?: KitchenHubOrderItem[] | null
  delivery?: { address?: KitchenHubOrderAddress | null; [key: string]: unknown } | null
  timestamps?: {
    placed_at?: string | null
    created_at?: string | null
    cancelled_at?: string | null
    updated_at?: string | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

/**
 * "The status of order can be either `new`, `accepted`, `completed` or
 * `canceled`". `completed` is the terminal fulfilled state; the canonical
 * enum's terminal fulfilled state is DELIVERED.
 */
function mapOrderStatus(s: string | null | undefined): OrderStatus {
  switch (s) {
    case 'new':
      return 'PENDING'
    case 'accepted':
      return 'PROCESSING'
    case 'completed':
      return 'DELIVERED'
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'unknown'
  }
}

const ALPHA2 = /^[A-Z]{2}$/

/** delivery.address: country (the example: "US"), street, unit_number, city, state, zipcode. */
function toAddress(raw: KitchenHubOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const address: Address = {
    street1: raw.street ?? undefined,
    street2: raw.unit_number ?? undefined,
    city: raw.city ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.zipcode ?? undefined,
    country: raw.country && ALPHA2.test(raw.country) ? raw.country : undefined,
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}

function toLineItems(items: KitchenHubOrderItem[] | null | undefined): Lineitem[] | undefined {
  if (!items || items.length === 0) return undefined
  return items.map((item) => ({
    id: item.id ?? undefined,
    name: item.name,
    quantity: item.quantity,
  }))
}

export function transformOrder(raw: KitchenHubOrder): Order {
  const t = raw.timestamps ?? {}
  return {
    id: String(raw.order.id),
    status: mapOrderStatus(raw.order.status),
    orderNumber: raw.order.number ?? undefined,
    warehouseId: raw.store?.id ?? undefined,
    destinationAddress: toAddress(raw.delivery?.address),
    lineItems: toLineItems(raw.items),
    notes: raw.order.notes ?? undefined,
    orderAt: toISODate(t.placed_at),
    cancelledAt: toISODate(t.cancelled_at),
    createdAt: toISODate(t.created_at),
    updatedAt: toISODate(t.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
