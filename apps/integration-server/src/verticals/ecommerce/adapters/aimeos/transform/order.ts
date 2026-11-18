/**
 * Aimeos Order → canonical Order.
 *
 * Aimeos exposes orders via JSON:API at `GET /api/order`. The order model
 * is split into a base record (`order`) plus an order-base record
 * (`order/base`) that holds address and product details.
 *
 * `order` resource attributes (dot-notation):
 *   order.id              — numeric/string id
 *   order.baseid          — FK to order/base
 *   order.statusdelivery  — delivery status int (see AIMEOS_ORDER_STATUS)
 *   order.statuspayment   — payment status int
 *   order.datepayment     — ISO datetime of payment
 *   order.ctime           — ISO datetime created
 *   order.mtime           — ISO datetime updated
 *
 * `order/base` resource attributes:
 *   order.base.id         — id
 *   order.base.price      — total price string
 *   order.base.costs      — shipping cost string
 *   order.base.currencyid — ISO 4217 currency
 *   order.base.customerid — customer id
 *   order.base.email      — customer email
 *   order.base.comment    — order note
 *   order.base.ctime      — ISO created
 *   order.base.mtime      — ISO updated
 *
 * `order/base/product` (line items) attributes:
 *   order.base.product.id
 *   order.base.product.name      — product name
 *   order.base.product.quantity  — int quantity
 *   order.base.product.price     — unit price string
 *   order.base.product.currencyid
 *   order.base.product.productid — FK to product
 *   order.base.product.prodcode  — SKU
 *
 * Payment status mapping (order.statuspayment):
 *   -1 = unfinished
 *    0 = deleted
 *    1 = canceled
 *    2 = refused
 *    3 = refunded
 *    4 = pending
 *    5 = authorized
 *    6 = received
 *
 * Delivery status mapping (order.statusdelivery):
 *   -1 = deleted
 *    0 = unfinished
 *    1 = waiting
 *    2 = progress
 *    3 = dispatch
 *    4 = delivered
 *    5 = lost
 *    6 = refused
 *    7 = returned
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import type { AimeosResource } from '../client'

// ── Raw Aimeos shapes ─────────────────────────────────────────────────────────

export interface AimeosOrderAttributes {
  'order.id'?: string | number
  'order.baseid'?: string | number
  'order.statusdelivery'?: number
  'order.statuspayment'?: number
  'order.datepayment'?: string | null
  'order.ctime'?: string | null
  'order.mtime'?: string | null
  [key: string]: unknown
}

export interface AimeosOrderBaseAttributes {
  'order.base.id'?: string | number
  'order.base.price'?: string | number
  'order.base.costs'?: string | number
  'order.base.currencyid'?: string
  'order.base.customerid'?: string | number
  'order.base.email'?: string | null
  'order.base.comment'?: string | null
  'order.base.ctime'?: string | null
  'order.base.mtime'?: string | null
  [key: string]: unknown
}

export interface AimeosOrderProductAttributes {
  'order.base.product.id'?: string | number
  'order.base.product.name'?: string
  'order.base.product.quantity'?: number | string
  'order.base.product.price'?: string | number
  'order.base.product.currencyid'?: string
  'order.base.product.productid'?: string | number
  'order.base.product.prodcode'?: string
  [key: string]: unknown
}

export interface AimeosAddressAttributes {
  'order.base.address.address1'?: string | null
  'order.base.address.address2'?: string | null
  'order.base.address.city'?: string | null
  'order.base.address.state'?: string | null
  'order.base.address.postal'?: string | null
  'order.base.address.countryid'?: string | null
  [key: string]: unknown
}

export type AimeosOrder = AimeosResource & {
  attributes: AimeosOrderAttributes
}

export type AimeosOrderBase = AimeosResource & {
  attributes: AimeosOrderBaseAttributes
}

export type AimeosOrderProduct = AimeosResource & {
  attributes: AimeosOrderProductAttributes
}

export type AimeosAddress = AimeosResource & {
  attributes: AimeosAddressAttributes
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function mapPaymentStatus(status: number | undefined): OrderFinancialStatus | undefined {
  if (status == null) return undefined
  switch (status) {
    case 6:
      return 'PAID'
    case 5:
      return 'AUTHORIZED'
    case 4:
      return 'PENDING'
    case 3:
      return 'REFUNDED'
    case 2:
      return 'VOIDED'
    case 1:
      return 'VOIDED'
    case -1:
    case 0:
      return 'PENDING'
    default:
      return 'PENDING'
  }
}

function mapDeliveryStatus(status: number | undefined): OrderFulfillmentStatus | undefined {
  if (status == null) return undefined
  switch (status) {
    case 4:
      return 'FULFILLED'
    case 3:
    case 2:
      return 'PARTIAL'
    case 1:
    case 0:
    case -1:
      return 'UNFULFILLED'
    case 7:
      return 'RESTOCKED'
    default:
      return 'UNFULFILLED'
  }
}

function mapAddress(attrs: AimeosAddressAttributes): Address | undefined {
  const line1 = attrs['order.base.address.address1'] ?? undefined
  const line2 = attrs['order.base.address.address2'] ?? undefined
  const city = attrs['order.base.address.city'] ?? undefined
  const region = attrs['order.base.address.state'] ?? undefined
  const postalCode = attrs['order.base.address.postal'] ?? undefined
  const country = attrs['order.base.address.countryid'] ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return { line1, line2, city, region, postalCode, country }
}

function mapLineItem(raw: AimeosOrderProduct, fallbackCurrency: string): LineItem {
  const attrs = raw.attributes
  const unitPrice = parseFloat(String(attrs['order.base.product.price'] ?? '0')) || 0
  const currency = (attrs['order.base.product.currencyid'] as string | undefined) ?? fallbackCurrency
  const qty =
    typeof attrs['order.base.product.quantity'] === 'string'
      ? parseInt(attrs['order.base.product.quantity'], 10)
      : (attrs['order.base.product.quantity'] as number | undefined) ?? 1

  return {
    id: raw.id,
    productId: attrs['order.base.product.productid'] != null
      ? String(attrs['order.base.product.productid'])
      : undefined,
    title: (attrs['order.base.product.name'] as string | undefined) ?? '',
    quantity: Math.max(1, Math.round(qty)),
    sku: attrs['order.base.product.prodcode'] as string | undefined,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrder(
  raw: AimeosOrder,
  base?: AimeosOrderBase,
  lineItems?: AimeosOrderProduct[],
  shippingAddress?: AimeosAddress,
  billingAddress?: AimeosAddress,
): Order {
  const attrs = raw.attributes
  const baseAttrs = base?.attributes ?? {}
  const currency = (baseAttrs['order.base.currencyid'] as string | undefined) ?? 'USD'
  const totalPrice = baseAttrs['order.base.price'] != null
    ? {
        amount: majorToMinor(parseFloat(String(baseAttrs['order.base.price'])) || 0, currency),
        currency,
      }
    : undefined
  const totalShipping = baseAttrs['order.base.costs'] != null
    ? {
        amount: majorToMinor(parseFloat(String(baseAttrs['order.base.costs'])) || 0, currency),
        currency,
      }
    : undefined
  const customerId = baseAttrs['order.base.customerid'] != null
    ? String(baseAttrs['order.base.customerid'])
    : undefined

  const paymentStatus = attrs['order.statuspayment'] as number | undefined
  const deliveryStatus = attrs['order.statusdelivery'] as number | undefined
  const isCanceled = paymentStatus === 1 || deliveryStatus === -1

  const mappedLineItems = lineItems?.map((li) => mapLineItem(li, currency))

  return {
    id: raw.id,
    orderNumber: raw.id,
    name: `#${raw.id}`,
    customerId,
    email: baseAttrs['order.base.email'] as string | undefined,
    currency,
    totalPrice,
    totalShipping,
    financialStatus: mapPaymentStatus(paymentStatus),
    fulfillmentStatus: mapDeliveryStatus(deliveryStatus),
    lineItems: mappedLineItems && mappedLineItems.length > 0 ? mappedLineItems : undefined,
    shippingAddress: shippingAddress ? mapAddress(shippingAddress.attributes) : undefined,
    billingAddress: billingAddress ? mapAddress(billingAddress.attributes) : undefined,
    note: baseAttrs['order.base.comment'] as string | undefined,
    createdAt: (attrs['order.ctime'] ?? baseAttrs['order.base.ctime']) as string | undefined,
    updatedAt: (attrs['order.mtime'] ?? baseAttrs['order.base.mtime']) as string | undefined,
    cancelledAt: isCanceled ? (attrs['order.mtime'] as string | undefined) : undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}
