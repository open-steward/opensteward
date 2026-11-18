/**
 * IdoSell Order → canonical Order.
 *
 * Shape verified against the OpenAPI fragment embedded in
 * https://idosell.readme.io/reference/ordersordersget (id/serial-number
 * lookup) and https://idosell.readme.io/reference/ordersorderssearchpost
 * (paginated search) — both return the same order object under
 * `Results[]` / `orderDetails`. `orderStatus`'s fixed enum (including the
 * `canceled` value `updateOrder`/`cancelOrder` write) comes from
 * https://idosell.readme.io/reference/ordersordersput.
 *
 * Money fields (`price`, `subtotalPrice`, …) are all required-with-currency
 * on the canonical schema, so any of them that would need a fabricated
 * currency or amount is left off the order rather than invented.
 */

import type { Order, LineItem } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

export interface RawIdosellAddress {
  clientFirstName?: string
  clientLastName?: string
  clientStreet?: string
  clientZipCode?: string
  clientCity?: string
  clientCountryId?: string
  clientPhone1?: string
}

export interface RawIdosellClientAccount {
  clientId?: number | string
  clientEmail?: string
  clientPhone1?: string
}

export interface RawIdosellOrderProduct {
  productId: number | string
  productName?: string
  productCode?: string
  sizeId?: string
  productQuantity?: number
  productOrderPrice?: number
  productOrderPriceNet?: number
  productVat?: number
}

export interface RawIdosellOrderCurrency {
  currencyId?: string
  orderProductsCost?: number
  orderDeliveryCost?: number
}

export interface RawIdosellOrder {
  orderId: number | string
  orderSerialNumber?: number | string
  clientResult?: {
    clientBillingAddress?: RawIdosellAddress
    clientDeliveryAddress?: RawIdosellAddress
    clientAccount?: RawIdosellClientAccount
  }
  orderDetails?: {
    orderStatus?: string
    orderAddDate?: string
    orderChangeDate?: string
    orderDispatchDate?: string
    productsResults?: RawIdosellOrderProduct[]
    payments?: { orderCurrency?: RawIdosellOrderCurrency }
    discountCode?: string
  }
  [key: string]: unknown
}

/**
 * IdoSell's `orderStatus` is a shop-defined workflow name, not a small fixed
 * set that maps cleanly onto the canonical financial/fulfillment enums.
 * Only the values whose meaning is unambiguous from the documented enum
 * itself (ordersordersput) are mapped; every other *present* status still
 * reported by the platform maps to the enum's own `'unknown'` member
 * (per `withUnknown` convention) rather than a guessed category. The raw
 * value always survives in `metadata`.
 */
const FULFILLMENT_MAP: Record<string, Exclude<Order['fulfillmentStatus'], undefined>> = {
  new: 'UNFULFILLED',
  payment_waiting: 'UNFULFILLED',
  delivery_waiting: 'UNFULFILLED',
  on_order: 'UNFULFILLED',
}

const FINANCIAL_MAP: Record<string, Exclude<Order['financialStatus'], undefined>> = {
  canceled: 'VOIDED',
  payment_waiting: 'PENDING',
}

function mapAddress(raw: RawIdosellAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const country = raw.clientCountryId?.toUpperCase()
  const line1 = raw.clientStreet ?? undefined
  const city = raw.clientCity ?? undefined
  const postalCode = raw.clientZipCode ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, city, postalCode, country }
}

/** `quantity` and `price` are required on the canonical shape — a row
 *  missing either (or missing a resolvable order currency) is dropped. */
function mapLineItem(raw: RawIdosellOrderProduct, currency: string | undefined): LineItem | undefined {
  if (raw.productQuantity == null || raw.productOrderPrice == null || !currency) return undefined
  return {
    id: `${raw.productId}:${raw.sizeId ?? ''}`,
    productId: String(raw.productId),
    title: raw.productName ?? raw.productCode ?? String(raw.productId),
    quantity: raw.productQuantity,
    price: { amount: majorToMinor(raw.productOrderPrice, currency), currency },
    sku: raw.productCode || undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawIdosellOrder): Order {
  const details = raw.orderDetails ?? {}
  const currency = details.payments?.orderCurrency?.currencyId?.toUpperCase()
  const status = details.orderStatus
  const productsCost = details.payments?.orderCurrency?.orderProductsCost
  const deliveryCost = details.payments?.orderCurrency?.orderDeliveryCost
  const lineItems = (details.productsResults ?? [])
    .map((p) => mapLineItem(p, currency))
    .filter((li): li is LineItem => li !== undefined)

  return {
    id: String(raw.orderId),
    orderNumber: raw.orderSerialNumber != null ? String(raw.orderSerialNumber) : undefined,
    name: raw.orderSerialNumber != null ? `#${raw.orderSerialNumber}` : undefined,
    customerId:
      raw.clientResult?.clientAccount?.clientId != null
        ? String(raw.clientResult.clientAccount.clientId)
        : undefined,
    email: raw.clientResult?.clientAccount?.clientEmail || undefined,
    phone: raw.clientResult?.clientAccount?.clientPhone1 || undefined,
    currency,
    subtotalPrice:
      currency && productsCost != null
        ? { amount: majorToMinor(productsCost, currency), currency }
        : undefined,
    totalShipping:
      currency && deliveryCost != null
        ? { amount: majorToMinor(deliveryCost, currency), currency }
        : undefined,
    // Only when both parts are reported: a missing part counted as zero
    // would publish a total IdoSell never stated.
    totalPrice:
      currency && productsCost != null && deliveryCost != null
        ? { amount: majorToMinor(productsCost + deliveryCost, currency), currency }
        : undefined,
    financialStatus: status ? (FINANCIAL_MAP[status] ?? 'unknown') : undefined,
    fulfillmentStatus: status ? (FULFILLMENT_MAP[status] ?? 'unknown') : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    billingAddress: mapAddress(raw.clientResult?.clientBillingAddress),
    shippingAddress: mapAddress(raw.clientResult?.clientDeliveryAddress),
    discountCodes: details.discountCode ? [details.discountCode] : undefined,
    createdAt: toIsoDatetime(details.orderAddDate),
    updatedAt: toIsoDatetime(details.orderChangeDate),
    processedAt: toIsoDatetime(details.orderDispatchDate),
    cancelledAt: status === 'canceled' ? toIsoDatetime(details.orderChangeDate) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → one `params.orders[]` entry for `PUT /orders/orders`
 * (ordersordersput). Only `orderStatus` is written — IdoSell's order-update
 * endpoint mixes in courier/address/handler fields documented on separate
 * pages (orderscourierput, ordersdeliveryaddressput, …) that have no
 * canonical Order counterpart.
 */
export function untransformOrderStatus(orderId: string, status: string): Record<string, unknown> {
  return { orderId, orderStatus: status }
}
