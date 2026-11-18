/**
 * Trendyol shipment package → canonical Order.
 *
 * Trendyol's order model is shipment-package-centric: the API endpoint
 * is /integration/order/sellers/{sellerId}/orders and returns
 * "shipment packages" — groups of order lines in a single delivery.
 *
 * Key mapping decisions:
 *
 *   shipmentPackageId   → Order.id
 *   orderNumber         → Order.orderNumber / Order.name
 *   customerId          → Order.customerId
 *   customerEmail       → Order.email
 *   shipmentPackageStatus / status → mapped to canonical financial+fulfillment
 *   packageTotalPrice   → Order.totalPrice (decimal TRY → minor units)
 *   packageGrossAmount  → Order.subtotalPrice
 *   packageTotalDiscount→ Order.totalDiscounts
 *   lines               → Order.lineItems
 *   shipmentAddress     → Order.shippingAddress
 *   invoiceAddress      → Order.billingAddress
 *   orderDate           → Order.createdAt (ms timestamp → ISO)
 *   lastModifiedDate    → Order.updatedAt (ms timestamp → ISO)
 *   currencyCode        → Order.currency
 *
 * Trendyol status → canonical pair:
 *   Created    → {PENDING,     UNFULFILLED}
 *   Picking    → {AUTHORIZED,  UNFULFILLED}
 *   Invoiced   → {PAID,        UNFULFILLED}
 *   Shipped    → {PAID,        PARTIAL}
 *   Delivered  → {PAID,        FULFILLED}
 *   Cancelled  → {VOIDED,      UNFULFILLED}
 *   Returned   → {REFUNDED,    RESTOCKED}
 *   UnDelivered→ {PAID,        UNFULFILLED}
 *   UnSupplied → {VOIDED,      UNFULFILLED}
 *
 * Docs: https://developers.trendyol.com/v2.0/docs/get-order-packages-getshipmentpackages
 */

import { toIsoDatetime } from '@opensteward/shared'
import type {
  Order,
  LineItem,
  OrderFinancialStatus,
  OrderFulfillmentStatus,
} from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { majorToMinor } from '../../../schema/shared'

// ── Raw Trendyol shapes ──────────────────────────────────────────────────────

export interface RawTrendyolAddress {
  id?: number | string
  firstName?: string | null
  lastName?: string | null
  company?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  district?: string | null
  postalCode?: string | null
  countryCode?: string | null
  phone?: string | null
  fullAddress?: string | null
  addressLines?: {
    addressLine1?: string | null
    addressLine2?: string | null
  } | null
  [key: string]: unknown
}

export interface RawTrendyolLineItem {
  lineId: number | string
  contentId?: number | string
  productName?: string | null
  stockCode?: string | null
  barcode?: string | null
  quantity?: number | null
  productSize?: string | null
  productColor?: string | null
  lineUnitPrice?: number | null
  lineGrossAmount?: number | null
  lineTotalDiscount?: number | null
  vatRate?: number | null
  currencyCode?: string | null
  orderLineItemStatusName?: string | null
  productCategoryId?: number | string | null
  [key: string]: unknown
}

export interface RawTrendyolOrder {
  shipmentPackageId: number | string
  orderNumber?: string | null
  customerId?: number | string | null
  supplierId?: number | string | null
  shipmentPackageStatus?: string | null
  status?: string | null
  orderDate?: number | null
  lastModifiedDate?: number | null
  customerFirstName?: string | null
  customerLastName?: string | null
  customerEmail?: string | null
  packageTotalPrice?: number | null
  packageGrossAmount?: number | null
  packageTotalDiscount?: number | null
  packageSellerDiscount?: number | null
  currencyCode?: string | null
  lines?: RawTrendyolLineItem[]
  shipmentAddress?: RawTrendyolAddress | null
  invoiceAddress?: RawTrendyolAddress | null
  cargoTrackingNumber?: number | string | null
  cargoTrackingLink?: string | null
  cargoProviderName?: string | null
  isCod?: boolean
  commercial?: boolean
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function toNum(v: number | string | null | undefined): number {
  if (v == null) return 0
  return typeof v === 'string' ? parseFloat(v) : v
}

function mapAddress(raw: RawTrendyolAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const line1 =
    raw.address1 ??
    raw.addressLines?.addressLine1 ??
    raw.fullAddress ??
    undefined
  if (!line1 && !raw.city && !raw.postalCode && !raw.countryCode) return undefined
  return {
    line1: line1 ?? undefined,
    line2: raw.address2 ?? raw.addressLines?.addressLine2 ?? undefined,
    city: raw.city ?? raw.district ?? undefined,
    postalCode: raw.postalCode ?? undefined,
    country: raw.countryCode ?? undefined,
  }
}

function mapStatuses(status: string | null | undefined): {
  financialStatus?: OrderFinancialStatus
  fulfillmentStatus?: OrderFulfillmentStatus
} {
  if (!status) return {}
  switch (status.toLowerCase()) {
    case 'created':
      return { financialStatus: 'PENDING', fulfillmentStatus: 'UNFULFILLED' }
    case 'picking':
      return { financialStatus: 'AUTHORIZED', fulfillmentStatus: 'UNFULFILLED' }
    case 'invoiced':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    case 'shipped':
      return { financialStatus: 'PAID', fulfillmentStatus: 'PARTIAL' }
    case 'delivered':
      return { financialStatus: 'PAID', fulfillmentStatus: 'FULFILLED' }
    case 'cancelled':
    case 'unsupplied':
      return { financialStatus: 'VOIDED', fulfillmentStatus: 'UNFULFILLED' }
    case 'returned':
      return { financialStatus: 'REFUNDED', fulfillmentStatus: 'RESTOCKED' }
    case 'undelivered':
    case 'repack':
    case 'atcollectionpoint':
    case 'unpacked':
      return { financialStatus: 'PAID', fulfillmentStatus: 'UNFULFILLED' }
    default:
      return {}
  }
}

function mapLineItem(raw: RawTrendyolLineItem, currency: string): LineItem {
  const qty = Math.max(toNum(raw.quantity), 1)
  const unitPrice = toNum(raw.lineUnitPrice)
  const totalDiscount = toNum(raw.lineTotalDiscount)

  return {
    id: String(raw.lineId),
    productId: raw.contentId != null ? String(raw.contentId) : undefined,
    variantId: raw.barcode ?? undefined,
    title: raw.productName ?? '',
    quantity: qty,
    sku: raw.stockCode ?? raw.barcode ?? undefined,
    price: { amount: majorToMinor(unitPrice, currency), currency },
    totalDiscount:
      totalDiscount > 0
        ? { amount: majorToMinor(totalDiscount, currency), currency }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformOrder(raw: RawTrendyolOrder): Order {
  const currency = raw.currencyCode ?? 'TRY'
  const money = (v: number | null | undefined) =>
    v != null ? { amount: majorToMinor(toNum(v), currency), currency } : undefined
  const status = raw.shipmentPackageStatus ?? raw.status
  const { financialStatus, fulfillmentStatus } = mapStatuses(status)

  const shippingAddress = mapAddress(raw.shipmentAddress)
  const billingAddress = mapAddress(raw.invoiceAddress)

  return {
    id: String(raw.shipmentPackageId),
    orderNumber: raw.orderNumber ?? undefined,
    name: raw.orderNumber != null ? `#${raw.orderNumber}` : undefined,
    customerId:
      raw.customerId != null && raw.customerId !== 0
        ? String(raw.customerId)
        : undefined,
    email: raw.customerEmail ?? undefined,
    currency,
    subtotalPrice: money(raw.packageGrossAmount),
    totalDiscounts: money(raw.packageTotalDiscount),
    totalPrice: money(raw.packageTotalPrice),
    financialStatus,
    fulfillmentStatus,
    lineItems: (raw.lines ?? []).map((li) => mapLineItem(li, currency)),
    shippingAddress,
    billingAddress,
    cancelledAt:
      status?.toLowerCase() === 'cancelled' ? toIsoDatetime(raw.lastModifiedDate) : undefined,
    createdAt: toIsoDatetime(raw.orderDate),
    updatedAt: toIsoDatetime(raw.lastModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
