/**
 * ePages Beyond Order ↔ canonical Order.
 *
 * Confirmed fields (https://api-docs.beyondshop.cloud/ng-order-order-public-api.html):
 * `_id`, `orderNumber`, `paymentStatus` (`PAID`/`PARTIALLY_PAID`/`PENDING`/
 * `REFUND_PENDING`/`VOIDED`), `shippingStatus` (`UNSHIPPED`/
 * `PARTIALLY_SHIPPED`/`SHIPPED`/`DELIVERED`/`CANCELED`/...), `currency`,
 * `subtotal`/`taxTotal`/`grandTotal`/`netTotal` (each `{amount, currency}`),
 * `productLineItems[]` (`_id`, `quantity`, `product: {_id, sku, name}`,
 * `unitPrice: {amount, currency, taxModel}`), `billingAddress`/
 * `shippingAddress` (`firstName`, `lastName`, `company`, `street`,
 * `houseNumber`, `postalCode`, `city`, `state`, `country`), `customerEmail`,
 * `customerId`, `createdAt`, `updatedAt` (no UTC offset in the raw value —
 * `toIsoDatetime` normalises it).
 *
 * `paymentStatus`/`shippingStatus` values with no faithful canonical
 * equivalent (`REFUND_PENDING`; `CANCELED` shipping) map to `'unknown'`
 * rather than a nearby-but-wrong enum member.
 */
import { toIsoDatetime } from '@opensteward/shared'
import type { LineItem, Order, OrderFinancialStatus, OrderFulfillmentStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

export interface RawEpagesMoney {
  amount?: number | null
  currency?: string
}

export interface RawEpagesOrderAddress {
  firstName?: string
  lastName?: string
  street?: string
  houseNumber?: string
  postalCode?: string
  city?: string
  state?: string
  country?: string
  [key: string]: unknown
}

export interface RawEpagesProductLineItem {
  _id: string
  quantity: number
  product?: { _id?: string; sku?: string; name?: string }
  unitPrice?: RawEpagesMoney
  [key: string]: unknown
}

export interface RawEpagesOrder {
  _id: string
  orderNumber?: string
  paymentStatus?: string
  shippingStatus?: string
  currency?: string
  subtotal?: RawEpagesMoney
  taxTotal?: RawEpagesMoney
  grandTotal?: RawEpagesMoney
  productLineItems?: RawEpagesProductLineItem[]
  billingAddress?: RawEpagesOrderAddress
  shippingAddress?: RawEpagesOrderAddress
  customerEmail?: string
  customerId?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapMoney(raw: RawEpagesMoney | undefined): { amount: number; currency: string } | undefined {
  if (!raw || raw.amount == null || !raw.currency) return undefined
  return { amount: majorToMinor(raw.amount, raw.currency), currency: raw.currency }
}

function mapAddress(raw: RawEpagesOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    line1: [raw.street, raw.houseNumber].filter(Boolean).join(' ') || undefined,
    city: raw.city,
    region: raw.state,
    postalCode: raw.postalCode,
    country: raw.country,
  }
}

const FINANCIAL_STATUS: Record<string, OrderFinancialStatus> = {
  PAID: 'PAID',
  PARTIALLY_PAID: 'PARTIALLY_PAID',
  PENDING: 'PENDING',
  VOIDED: 'VOIDED',
}

const FULFILLMENT_STATUS: Record<string, OrderFulfillmentStatus> = {
  UNSHIPPED: 'UNFULFILLED',
  PARTIALLY_SHIPPED: 'PARTIAL',
  SHIPPED: 'FULFILLED',
  DELIVERED: 'FULFILLED',
}

function transformLineItem(li: RawEpagesProductLineItem): LineItem {
  if (!li.product?.name) {
    throw new Error(`ePages Beyond order line item '${li._id}' has no product.name`)
  }
  const price = mapMoney(li.unitPrice)
  if (!price) {
    throw new Error(`ePages Beyond order line item '${li._id}' has no unitPrice`)
  }
  return {
    id: li._id,
    productId: li.product._id,
    title: li.product.name,
    sku: li.product.sku ?? undefined,
    quantity: li.quantity,
    price,
    metadata: li as unknown as Record<string, unknown>,
  }
}

export function transformOrder(order: RawEpagesOrder): Order {
  return {
    id: order._id,
    orderNumber: order.orderNumber,
    customerId: order.customerId,
    email: order.customerEmail,
    currency: order.currency,
    subtotalPrice: mapMoney(order.subtotal),
    totalTax: mapMoney(order.taxTotal),
    totalPrice: mapMoney(order.grandTotal),
    financialStatus: order.paymentStatus ? (FINANCIAL_STATUS[order.paymentStatus] ?? 'unknown') : undefined,
    fulfillmentStatus: order.shippingStatus
      ? (FULFILLMENT_STATUS[order.shippingStatus] ?? 'unknown')
      : undefined,
    lineItems: (order.productLineItems ?? []).map((li) => transformLineItem(li)),
    billingAddress: mapAddress(order.billingAddress),
    shippingAddress: mapAddress(order.shippingAddress),
    createdAt: toIsoDatetime(order.createdAt),
    updatedAt: toIsoDatetime(order.updatedAt),
    metadata: order as unknown as Record<string, unknown>,
  }
}
