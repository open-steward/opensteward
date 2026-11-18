/**
 * Fynd OMS order ⇄ canonical Order (read-only).
 *
 * Source: `gofynd/fdk-client-javascript` @ commit
 * `7598488bf04e7a75bc44088441745538d524abec`,
 * `sdk/platform/Order/OrderPlatformClient.js` — `getOrders`
 * (`GET order/v1.0/company/{id}/orders-listing`, shape
 * `OrderPlatformModel.PlatformOrderItems()`) and `getOrderById`
 * (`GET order/v1.0/company/{id}/order-details?order_id=`, shape
 * `{order: OrderPlatformModel.OrderData(), success, shipments: PlatformShipment[]}`).
 *
 * These are two genuinely different, individually-verified response shapes
 * for "an order" — NOT two guesses at the same field. `PlatformOrderItems`
 * keys the id `order_id` and carries a flat `order_value`; `OrderData` (the
 * detail response) keys it `fynd_order_id` and has NO `order_value` field
 * at all (checked directly against the schema — it is not merely
 * undocumented, it is absent from `OrderData()`'s field list). So there are
 * two separate transform functions below, each reading only its own
 * verified fields — no `a ?? b` across the two shapes, and no invented
 * total for the detail response.
 *
 * `createOrder`/`updateOrder`/`cancelOrder` are intentionally not
 * implemented (see `metadata.ts`): `OrderPlatformClient.createOrder`
 * ingests a fully pre-computed shipment plan (store-assigned bags,
 * `shipping_info`, `billing_info`, `payment_info`, a required
 * `x-ordering-source` header) — channel-integration order import, not a
 * simple "create order from line items" call a `Partial<Order>` can drive.
 * Billing/shipping addresses are intentionally left unmapped: the only
 * address-shaped fields the order-details response exposes
 * (`PlatformShipment.delivery_details` / `.billing_details`) are typed as
 * `Joi.object().pattern(/\S/, Joi.any())` — an open object with no
 * documented key names.
 */
import type { Order } from '../../../schema/order'
import { majorToMinor } from '../../../schema/shared'

export interface RawFyndOrderUser {
  id?: number
  email?: string
  mobile?: string
}

/** `OrderPlatformModel.PlatformOrderItems()` — one item of `getOrders`'s
 *  `items[]`. */
export interface RawFyndOrderListItem {
  order_id: string
  order_created_time?: string
  order_value?: number
  currency?: { currency_code?: string }
  user_info?: RawFyndOrderUser
}

/** `OrderPlatformModel.OrderData()` — the `order` field of `getOrderById`'s
 *  response. Has no `order_value`; there is nothing verified to compute a
 *  `totalPrice` from here. */
export interface RawFyndOrderDetail {
  fynd_order_id: string
  order_date?: string
  currency?: { currency_code?: string }
}

function toIso(value: string | undefined): string | undefined {
  if (!value) return undefined
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export function transformOrderListItem(raw: RawFyndOrderListItem): Order {
  if (!raw.order_id) throw new Error('Fynd order listing item is missing order_id')
  const currency = raw.currency?.currency_code
  return {
    id: raw.order_id,
    name: raw.order_id,
    customerId: raw.user_info?.id != null ? String(raw.user_info.id) : undefined,
    email: raw.user_info?.email || undefined,
    phone: raw.user_info?.mobile || undefined,
    currency,
    totalPrice:
      raw.order_value != null && currency
        ? { amount: majorToMinor(raw.order_value, currency), currency }
        : undefined,
    createdAt: toIso(raw.order_created_time),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrderDetail(raw: RawFyndOrderDetail, user: RawFyndOrderUser | undefined): Order {
  if (!raw.fynd_order_id) throw new Error('Fynd order detail is missing fynd_order_id')
  return {
    id: raw.fynd_order_id,
    name: raw.fynd_order_id,
    customerId: user?.id != null ? String(user.id) : undefined,
    email: user?.email || undefined,
    phone: user?.mobile || undefined,
    currency: raw.currency?.currency_code,
    createdAt: toIso(raw.order_date),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
