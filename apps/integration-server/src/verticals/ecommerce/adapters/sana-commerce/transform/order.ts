/**
 * Sana Commerce order → canonical Order.
 *
 * Orders are retrieved via:
 *  PUT `order/pendingorders`   — list pending/open orders (body: LoadOptions)
 *  GET `order/details/{orderType}/{orderId}` — single order by id and type
 *
 * Sana Commerce order types:
 *  - `Order`   — confirmed sales orders
 *  - `Quote`   — quotations / offers (not yet confirmed)
 *
 * The storefront API is primarily read-oriented. Write operations
 * (`order/placeorder`, `order/calculatebasket`) accept basket payloads.
 * We map those to the canonical `createOrder` using `untransformOrder`.
 *
 * Prices are decimal major-unit values in the store's currency.
 *
 * Docs:
 *  https://help.sana-commerce.com/sana-commerce-90/how_tos/web-service-developer-guide/api-methods
 */

import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'
import { toIsoDatetime } from '@opensteward/shared'

// ── Raw Sana Commerce shapes ─────────────────────────────────────────────────

export interface RawSanaOrderAddress {
  Street?: string | null
  street?: string | null
  Street2?: string | null
  street2?: string | null
  City?: string | null
  city?: string | null
  ZipCode?: string | null
  zipCode?: string | null
  State?: string | null
  state?: string | null
  CountryCode?: string | null
  countryCode?: string | null
  Country?: string | null
  country?: string | null
}

export interface RawSanaOrderLine {
  Id?: number | string | null
  id?: number | string | null
  ProductId?: string | null
  productId?: string | null
  UnitId?: string | null
  unitId?: string | null
  Title?: string | null
  title?: string | null
  Quantity?: number | null
  quantity?: number | null
  UnitPrice?: number | null
  unitPrice?: number | null
  LineAmount?: number | null
  lineAmount?: number | null
  DiscountAmount?: number | null
  discountAmount?: number | null
  TaxAmount?: number | null
  taxAmount?: number | null
  Sku?: string | null
  sku?: string | null
  [key: string]: unknown
}

export interface RawSanaOrder {
  Id?: number | string | null
  id?: number | string | null
  OrderId?: string | null
  orderId?: string | null
  OrderNumber?: string | number | null
  orderNumber?: string | number | null
  CustomerId?: string | null
  customerId?: string | null
  Email?: string | null
  email?: string | null
  Phone?: string | null
  phone?: string | null
  Currency?: string | null
  currency?: string | null
  SubTotal?: number | null
  subTotal?: number | null
  TotalTax?: number | null
  totalTax?: number | null
  TotalDiscount?: number | null
  totalDiscount?: number | null
  ShippingAmount?: number | null
  shippingAmount?: number | null
  TotalAmount?: number | null
  totalAmount?: number | null
  Status?: string | null
  status?: string | null
  OrderType?: string | null
  orderType?: string | null
  Lines?: RawSanaOrderLine[] | null
  lines?: RawSanaOrderLine[] | null
  BillingAddress?: RawSanaOrderAddress | null
  billingAddress?: RawSanaOrderAddress | null
  ShippingAddress?: RawSanaOrderAddress | null
  shippingAddress?: RawSanaOrderAddress | null
  Note?: string | null
  note?: string | null
  DateCreated?: string | null
  dateCreated?: string | null
  DateModified?: string | null
  dateModified?: string | null
  DateProcessed?: string | null
  dateProcessed?: string | null
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function str(v: string | number | null | undefined): string | undefined {
  if (v == null) return undefined
  return String(v).trim() || undefined
}

function toMinor(v: number | null | undefined, currency: string): number {
  if (v == null || !Number.isFinite(v)) return 0
  return majorToMinor(v, currency)
}

function mapAddress(raw: RawSanaOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 = str(raw.Street ?? raw.street)
  const city = str(raw.City ?? raw.city)
  const postalCode = str(raw.ZipCode ?? raw.zipCode)
  const country = str(raw.CountryCode ?? raw.countryCode ?? raw.Country ?? raw.country)
  if (!line1 && !city && !postalCode && !country) return undefined
  return {
    line1,
    line2: str(raw.Street2 ?? raw.street2),
    city,
    region: str(raw.State ?? raw.state),
    postalCode,
    country,
  }
}

// Sana Commerce statuses → canonical financial status
const FIN_STATUS_MAP: Record<string, OrderFinancialStatus> = {
  open: 'PENDING',
  pending: 'PENDING',
  confirmed: 'PAID',
  invoiced: 'PAID',
  paid: 'PAID',
  partiallyinvoiced: 'PARTIALLY_PAID',
  partially_invoiced: 'PARTIALLY_PAID',
  cancelled: 'VOIDED',
  canceled: 'VOIDED',
  voided: 'VOIDED',
}

// Sana Commerce statuses → canonical fulfillment status
const FUL_STATUS_MAP: Record<string, OrderFulfillmentStatus> = {
  open: 'UNFULFILLED',
  pending: 'UNFULFILLED',
  partiallyshipped: 'PARTIAL',
  partially_shipped: 'PARTIAL',
  shipped: 'FULFILLED',
  delivered: 'FULFILLED',
  fulfilled: 'FULFILLED',
}

function mapLineItem(raw: RawSanaOrderLine, currency: string): LineItem {
  const id = str(raw.Id ?? raw.id) ?? ''
  const qty = raw.Quantity ?? raw.quantity ?? 0
  const unitPrice = raw.UnitPrice ?? raw.unitPrice

  return {
    id,
    productId: str(raw.ProductId ?? raw.productId),
    variantId: str(raw.UnitId ?? raw.unitId),
    title: str(raw.Title ?? raw.title) ?? '',
    quantity: qty,
    price: {
      amount: toMinor(unitPrice, currency),
      currency,
    },
    totalDiscount:
      (raw.DiscountAmount ?? raw.discountAmount) != null
        ? {
            amount: toMinor(raw.DiscountAmount ?? raw.discountAmount, currency),
            currency,
          }
        : undefined,
    sku: str(raw.Sku ?? raw.sku),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

// ── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: RawSanaOrder): Order {
  const id = str(raw.Id ?? raw.id ?? raw.OrderId ?? raw.orderId) ?? ''
  const currency = str(raw.Currency ?? raw.currency) ?? 'EUR'
  const rawStatus = str(raw.Status ?? raw.status)?.toLowerCase()
  const rawLines = raw.Lines ?? raw.lines ?? []

  const money = (v: number | null | undefined) =>
    v != null ? { amount: toMinor(v, currency), currency } : undefined

  return {
    id,
    orderNumber: str(raw.OrderNumber ?? raw.orderNumber),
    customerId: str(raw.CustomerId ?? raw.customerId),
    email: str(raw.Email ?? raw.email),
    phone: str(raw.Phone ?? raw.phone),
    currency,
    subtotalPrice: money(raw.SubTotal ?? raw.subTotal),
    totalTax: money(raw.TotalTax ?? raw.totalTax),
    totalDiscounts: money(raw.TotalDiscount ?? raw.totalDiscount),
    totalShipping: money(raw.ShippingAmount ?? raw.shippingAmount),
    totalPrice: money(raw.TotalAmount ?? raw.totalAmount),
    financialStatus: rawStatus
      ? FIN_STATUS_MAP[rawStatus] ?? undefined
      : undefined,
    fulfillmentStatus: rawStatus
      ? FUL_STATUS_MAP[rawStatus] ?? undefined
      : undefined,
    lineItems: rawLines.map((li) => mapLineItem(li, currency)),
    billingAddress: mapAddress(raw.BillingAddress ?? raw.billingAddress),
    shippingAddress: mapAddress(raw.ShippingAddress ?? raw.shippingAddress),
    note: str(raw.Note ?? raw.note),
    createdAt: toIsoDatetime(raw.DateCreated ?? raw.dateCreated),
    updatedAt: toIsoDatetime(raw.DateModified ?? raw.dateModified),
    processedAt: toIsoDatetime(raw.DateProcessed ?? raw.dateProcessed),
    metadata: raw as unknown as Record<string, unknown>,
  }
}

/**
 * Canonical Order → Sana Commerce basket body for `order/placeorder`.
 *
 * Sana uses a basket model: create a basket, add lines, then call placeorder.
 * This produces a minimal body suitable for order creation.
 */
export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    CustomerId: order.customerId,
    Email: order.email,
    Phone: order.phone,
    Note: order.note,
    ShippingAddress: order.shippingAddress
      ? {
          Street: order.shippingAddress.line1,
          Street2: order.shippingAddress.line2,
          City: order.shippingAddress.city,
          State: order.shippingAddress.region,
          ZipCode: order.shippingAddress.postalCode,
          CountryCode: order.shippingAddress.country,
        }
      : undefined,
    Lines: order.lineItems?.map((li) => ({
      ProductId: li.productId,
      UnitId: li.variantId,
      Quantity: li.quantity,
      Title: li.title,
      Sku: li.sku,
    })),
  }
}
