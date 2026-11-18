import { majorToMinor } from '@opensteward/shared'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { parseDecimal, toISODate } from '../../shared/transform'

/**
 * Orders API v0 `Address` (definitions.Address in ordersV0.json). Only the
 * fields the canonical address maps are typed; the rest ride in metadata.
 *
 * Reference: https://github.com/amzn/selling-partner-api-models/blob/main/models/orders-api-model/ordersV0.json
 */
export interface SpApiOrderAddress {
  Name?: string
  CompanyName?: string
  AddressLine1?: string
  AddressLine2?: string
  AddressLine3?: string
  City?: string
  StateOrRegion?: string
  PostalCode?: string
  /** "The country code. A two-character country code, in ISO 3166-1 alpha-2 format." */
  CountryCode?: string
  Phone?: string
  [key: string]: unknown
}

/**
 * Orders API v0 `Order` (definitions.Order). Required upstream:
 * AmazonOrderId, LastUpdateDate, OrderStatus, PurchaseDate.
 */
export interface SpApiOrder {
  AmazonOrderId: string
  SellerOrderId?: string
  PurchaseDate: string
  LastUpdateDate: string
  OrderStatus: string
  /** Money: `CurrencyCode` ("In ISO 4217 format") and `Amount` (a decimal string). */
  OrderTotal?: { CurrencyCode?: string; Amount?: string }
  ShippingAddress?: SpApiOrderAddress
  [key: string]: unknown
}

/** `GetOrdersResponse`: the list lives under `payload` (an `OrdersList`). */
export interface SpApiGetOrdersResponse {
  payload?: {
    Orders: SpApiOrder[]
    /** "When present and not empty, pass this string token in the next request to return the next response page." */
    NextToken?: string
    [key: string]: unknown
  }
  errors?: unknown[]
}

/** `GetOrderResponse`: the order lives under `payload`. */
export interface SpApiGetOrderResponse {
  payload?: SpApiOrder
  errors?: unknown[]
}

/**
 * The documented `OrderStatus` enum: Pending, Unshipped, PartiallyShipped,
 * Shipped, Canceled, Unfulfillable, InvoiceUnconfirmed, PendingAvailability.
 */
export function mapSpApiOrderStatus(status: string | undefined): OrderStatus {
  switch (status) {
    case 'Pending':
    case 'PendingAvailability':
      return 'PENDING'
    case 'Unshipped':
      return 'AWAITING_SHIPMENT'
    // InvoiceUnconfirmed: "All items in the order have been shipped. The seller
    // has not yet given confirmation to Amazon that the invoice has been
    // shipped to the buyer."
    case 'PartiallyShipped':
    case 'Shipped':
    case 'InvoiceUnconfirmed':
      return 'SHIPPED'
    case 'Canceled':
      return 'CANCELLED'
    default:
      // Unfulfillable, and anything outside the enum.
      return 'unknown'
  }
}

function toOrderAddress(raw: SpApiOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.Name || undefined,
    company: raw.CompanyName || undefined,
    street1: raw.AddressLine1 || undefined,
    street2: [raw.AddressLine2, raw.AddressLine3].filter(Boolean).join(', ') || undefined,
    city: raw.City || undefined,
    state: raw.StateOrRegion || undefined,
    postalCode: raw.PostalCode || undefined,
    country: raw.CountryCode || undefined,
    phone: raw.Phone || undefined,
  }
  return Object.values(addr).some((v) => v !== undefined) ? addr : undefined
}

export function transformOrder(raw: SpApiOrder): Order {
  // Money needs both halves: an amount without its currency cannot be put
  // into minor units, and a currency alone is no total.
  const currency = raw.OrderTotal?.CurrencyCode || undefined
  const amount = parseDecimal(raw.OrderTotal?.Amount)
  const hasTotal = currency !== undefined && amount !== undefined

  return {
    id: raw.AmazonOrderId,
    status: mapSpApiOrderStatus(raw.OrderStatus),
    orderNumber: raw.SellerOrderId || undefined,
    currency: hasTotal ? currency : undefined,
    totalAmount: hasTotal ? majorToMinor(amount, currency) : undefined,
    destinationAddress: toOrderAddress(raw.ShippingAddress),
    orderAt: toISODate(raw.PurchaseDate),
    createdAt: toISODate(raw.PurchaseDate),
    updatedAt: toISODate(raw.LastUpdateDate),
    metadata: raw as Record<string, unknown>,
  }
}
