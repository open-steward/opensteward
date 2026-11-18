/**
 * Crystallize Order -> canonical Order.
 *
 * Crystallize orders contain cart items, customer info, and payment data.
 * The Order API provides both read and write access.
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import { toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw shapes ──────────────────────────────────────────────────────────────

export interface RawCrystallizeOrderAddress {
  type?: string
  streetNumber?: string | null
  street?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  postalCode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

export interface RawCrystallizeOrderItem {
  name?: string
  sku?: string | null
  quantity: number
  productId?: string | null
  productVariantId?: string | null
  price?: {
    gross?: number
    net?: number
    currency?: string
    tax?: { name?: string; percent?: number }
  } | null
  imageUrl?: string | null
  [key: string]: unknown
}

export interface RawCrystallizeOrderPayment {
  provider?: string | null
  providerId?: string | null
  [key: string]: unknown
}

export interface RawCrystallizeOrder {
  id: string
  /** Crystallize uses `createdAt` as a reference. Some return orderId as number. */
  referenceId?: string | null
  customer?: {
    identifier?: string
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    phone?: string | null
    addresses?: RawCrystallizeOrderAddress[]
  } | null
  cart?: RawCrystallizeOrderItem[]
  total?: { gross?: number; net?: number; currency?: string; tax?: { name?: string; percent?: number } } | null
  payment?: RawCrystallizeOrderPayment[] | null
  additionalInformation?: string | null
  meta?: Array<{ key: string; value: string }> | null
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

// ── Status mapping ──────────────────────────────────────────────────────────

function mapFinancialStatus(raw: RawCrystallizeOrder): OrderFinancialStatus | undefined {
  // Crystallize doesn't have built-in financial status. If payments exist, assume PAID.
  if (raw.payment && raw.payment.length > 0) return 'PAID'
  return 'PENDING'
}

function mapFulfillmentStatus(_raw: RawCrystallizeOrder): OrderFulfillmentStatus | undefined {
  // Crystallize does not have built-in fulfillment status
  return 'UNFULFILLED'
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function mapAddress(raw: RawCrystallizeOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1Parts = [raw.streetNumber, raw.street].filter(Boolean)
  const line1 = line1Parts.length > 0 ? line1Parts.join(' ') : undefined
  const city = raw.city ?? undefined
  const postalCode = raw.postalCode ?? undefined
  const country = raw.country ?? undefined
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: raw.street2 ?? undefined,
    city,
    region: raw.state ?? undefined,
    postalCode,
    country,
  }
}

function mapLineItem(raw: RawCrystallizeOrderItem, currency: string): LineItem {
  const unitAmount = raw.price?.gross ?? raw.price?.net ?? 0
  const lineCurrency = raw.price?.currency ?? currency
  return {
    id: raw.sku ?? `${raw.productId ?? ''}:${raw.productVariantId ?? ''}`,
    productId: raw.productId ?? undefined,
    variantId: raw.productVariantId ?? undefined,
    title: raw.name ?? '',
    quantity: raw.quantity,
    price: { amount: majorToMinor(unitAmount, lineCurrency), currency: lineCurrency },
    sku: raw.sku ?? undefined,
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ───────────────────────────────────────────────────────────────

export function transformOrder(raw: RawCrystallizeOrder): Order {
  const currency = raw.total?.currency ?? 'USD'

  const billingAddr = raw.customer?.addresses?.find((a) => a.type === 'billing')
  const shippingAddr = raw.customer?.addresses?.find((a) => a.type === 'delivery' || a.type === 'shipping')
    ?? raw.customer?.addresses?.[0]

  return {
    id: raw.id,
    orderNumber: raw.referenceId ?? undefined,
    customerId: raw.customer?.identifier ?? undefined,
    email: raw.customer?.email ?? undefined,
    phone: raw.customer?.phone ?? undefined,
    currency,
    totalPrice: raw.total?.gross != null
      ? { amount: majorToMinor(raw.total.gross, currency), currency }
      : undefined,
    financialStatus: mapFinancialStatus(raw),
    fulfillmentStatus: mapFulfillmentStatus(raw),
    lineItems: (raw.cart ?? []).map((item) => mapLineItem(item, currency)),
    billingAddress: mapAddress(billingAddr),
    shippingAddress: mapAddress(shippingAddr),
    note: raw.additionalInformation ?? undefined,
    createdAt: toIsoDatetime(raw.createdAt),
    updatedAt: toIsoDatetime(raw.updatedAt),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    customer: order.email ? {
      firstName: '',
      lastName: '',
      identifier: order.customerId ?? order.email,
      addresses: [
        order.shippingAddress ? {
          type: 'delivery',
          street: order.shippingAddress.line1,
          street2: order.shippingAddress.line2,
          city: order.shippingAddress.city,
          state: order.shippingAddress.region,
          postalCode: order.shippingAddress.postalCode,
          country: order.shippingAddress.country,
          email: order.email,
        } : undefined,
      ].filter(Boolean),
    } : undefined,
    cart: order.lineItems?.map((li) => ({
      name: li.title,
      sku: li.sku,
      quantity: li.quantity,
      price: li.price ? {
        gross: li.price.amount,
        net: li.price.amount,
        currency: li.price.currency,
      } : undefined,
      productId: li.productId,
      productVariantId: li.variantId,
    })),
  }
}
