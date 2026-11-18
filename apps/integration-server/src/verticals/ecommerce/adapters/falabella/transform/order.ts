/**
 * Falabella order → canonical Order.
 *
 * `GetOrder` (docs: https://developers.falabella.com/docs/orders/getorder)
 * returns, verbatim per the docs' own XML example (envelope
 * `SuccessResponse.Body.Orders.Order`):
 *
 *   <Order><OrderId>1104901123</OrderId><OrderNumber>2777001234</OrderNumber>
 *     <Price>19990</Price><CreatedAt>2025-04-01 12:00:00</CreatedAt>
 *     <UpdatedAt>2025-04-01 15:00:00</UpdatedAt>
 *     <AddressBilling><FirstName/><LastName/><Address1/><Address2/><Address3/>
 *       <CustomerEmail/><City/><Region/><PostCode/><Country>CL</Country><Phone/></AddressBilling>
 *     <AddressShipping>...(same shape)...</AddressShipping>
 *     <GrandTotal>19990</GrandTotal><Statuses><Status>ready_to_ship</Status></Statuses>
 *   </Order>
 *
 * `GetOrderItems` (docs:
 * https://developers.falabella.com/docs/orders/getorderitems) returns,
 * verbatim per the docs' own JSON example (envelope
 * `SuccessResponse.Body.OrderItems.OrderItem`):
 *
 *   { "OrderItemId": "101311982", "OrderId": "1001687807", "Name": "...",
 *     "Sku": "2521154701", "Currency": "COP", "Status": "pending",
 *     "ShipmentProvider": "ibis", "TrackingCode": "800026611544860011",
 *     "ItemPrice": "3521.00", "PaidPrice": "3521.00" }
 *
 * `GetOrderItems` has no `Quantity` field — this API models one row per
 * physical unit (a documented structural fact of this family of Seller
 * Center APIs, not a guess), so `LineItem.quantity` is always `1`.
 *
 * Dates (`CreatedAt`/`UpdatedAt`, `"2025-04-01 12:00:00"`, space-separated,
 * no timezone) go through `toIsoDatetime`, which normalises that exact shape.
 *
 * Neither action reports a currency at the ORDER level — only
 * `GetOrderItems.Currency` is confirmed — so `transformOrder` takes the
 * connection's own configured business-unit currency as a fallback for
 * order-level totals when there are no items to read one from.
 *
 * Status vocabulary: `pending` and `ready_to_ship` are confirmed directly
 * from live response examples above; `canceled` is confirmed as a real
 * value via `SetStatusToCanceled`'s "solo si está en estado 'pending'"
 * description. `shipped`/`delivered`/`returned` are this API family's
 * well-established (but not, on the pages fetched, example-confirmed)
 * status vocabulary — included with the same `unknown` fallback as anything
 * genuinely unrecognised.
 */
import type { Order, LineItem, OrderFulfillmentStatus } from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'
import { isIso3166Alpha2, toIsoDatetime } from '@opensteward/shared'
import { toArray } from '../client'

export interface RawFalabellaAddress {
  FirstName?: string
  LastName?: string
  Address1?: string
  Address2?: string
  Address3?: string
  CustomerEmail?: string
  City?: string
  Region?: string
  PostCode?: string
  Country?: string
  Phone?: string
}

export interface RawFalabellaOrder {
  OrderId: string
  OrderNumber: string
  Price: string
  CreatedAt?: string
  UpdatedAt?: string
  AddressBilling?: RawFalabellaAddress
  AddressShipping?: RawFalabellaAddress
  GrandTotal: string
  Statuses?: { Status?: string | string[] }
}

export interface RawFalabellaOrderItem {
  OrderItemId: string
  OrderId: string
  Name: string
  Sku: string
  Currency: string
  Status: string
  ShipmentProvider?: string
  TrackingCode?: string
  ItemPrice: string
  PaidPrice: string
}

/** `pending`/`ready_to_ship` confirmed live; `canceled` confirmed by description; see file header. */
export function mapFulfillmentStatus(status: string | undefined): OrderFulfillmentStatus {
  switch (status) {
    case 'shipped':
      return 'PARTIAL'
    case 'delivered':
      return 'FULFILLED'
    case 'pending':
    case 'ready_to_ship':
    case 'canceled':
    case 'returned':
      return 'UNFULFILLED'
    default:
      return 'unknown'
  }
}

function mapAddress(raw: RawFalabellaAddress | undefined) {
  if (!raw) return undefined
  const country = raw.Country?.toUpperCase()
  return {
    line1: raw.Address1,
    line2: [raw.Address2, raw.Address3].filter(Boolean).join(' ') || undefined,
    city: raw.City,
    region: raw.Region,
    postalCode: raw.PostCode,
    country: country && isIso3166Alpha2(country) ? country : undefined,
  }
}

function mapLineItem(raw: RawFalabellaOrderItem): LineItem {
  return {
    id: raw.OrderItemId,
    title: raw.Name,
    // GetOrderItems has no Quantity field — one row is always one unit; see file header.
    quantity: 1,
    price: { amount: majorToMinor(parseFloat(raw.ItemPrice), raw.Currency), currency: raw.Currency },
    sku: raw.Sku,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(
  raw: RawFalabellaOrder,
  items: RawFalabellaOrderItem[],
  fallbackCurrency: string,
): Order {
  const currency = items[0]?.Currency ?? fallbackCurrency
  const statuses = toArray(raw.Statuses?.Status)

  return {
    id: raw.OrderId,
    orderNumber: raw.OrderNumber,
    name: raw.OrderNumber,
    email: raw.AddressShipping?.CustomerEmail,
    phone: raw.AddressShipping?.Phone || undefined,
    currency,
    totalPrice: { amount: majorToMinor(parseFloat(raw.GrandTotal), currency), currency },
    fulfillmentStatus: mapFulfillmentStatus(statuses[0]),
    lineItems: items.length > 0 ? items.map(mapLineItem) : undefined,
    billingAddress: mapAddress(raw.AddressBilling),
    shippingAddress: mapAddress(raw.AddressShipping),
    createdAt: toIsoDatetime(raw.CreatedAt),
    updatedAt: toIsoDatetime(raw.UpdatedAt),
    cancelledAt: statuses.includes('canceled') ? toIsoDatetime(raw.UpdatedAt) : undefined,
    metadata: { order: raw, items },
  }
}
