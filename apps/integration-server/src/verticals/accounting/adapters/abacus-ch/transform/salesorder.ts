/**
 * Transform Abacus ERP sales order records to the canonical SalesOrder schema.
 *
 * Abacus exposes sales orders through the OData entity set "SalesOrders".
 * These represent customer orders / offers (Aufträge) before invoicing.
 *
 * Key Abacus sales order fields:
 *   Id              – numeric string primary key
 *   Status          – order status string
 *   CustomerId      – foreign key to the customer address
 *   AccountId       – GL account foreign key
 *   CurrencyCode    – ISO 4217 code
 *   TotalAmount     – gross total (decimal, NOT minor units)
 *   SalesChannel    – channel description string
 *   OrderDate       – ISO date string (yyyy-MM-dd)
 *   Positions       – line items array
 *   BillingAddress  – billing address object
 *   ShippingAddress – delivery address object
 *   CreatedAt / ModifiedAt – ISO datetime strings
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Address, Lineitem } from '../../../schema/shared'

// ── Abacus payload types ──────────────────────────────────────────────────────

export interface AbacusOrderAddress {
  Street?: string
  AddressLine2?: string
  City?: string
  Region?: string
  PostalCode?: string
  CountryCode?: string
  [key: string]: unknown
}

export interface AbacusSalesOrderPosition {
  Id?: string | number
  ArticleId?: string | number
  ArticleNumber?: string
  Description?: string
  Quantity?: number
  UnitPrice?: number
  TotalPrice?: number
  TaxAmount?: number
  DiscountAmount?: number
  [key: string]: unknown
}

export interface AbacusSalesOrder {
  Id: string | number
  Status?: string
  CustomerId?: string | number
  AccountId?: string | number
  CurrencyCode?: string
  TotalAmount?: number
  SalesChannel?: string
  OrderDate?: string
  Positions?: AbacusSalesOrderPosition[]
  BillingAddress?: AbacusOrderAddress
  ShippingAddress?: AbacusOrderAddress
  CreatedAt?: string
  ModifiedAt?: string
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapStatus(raw: string | undefined): SalesOrderStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'draft' || s === 'entwurf') return 'DRAFT'
  if (s === 'active' || s === 'open' || s === 'offen') return 'ACTIVE'
  if (s === 'completed' || s === 'closed' || s === 'abgeschlossen' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled' || s === 'storniert') return 'CANCELLED'
  return 'ACTIVE'
}

// ── Address mapping ───────────────────────────────────────────────────────────

function mapAddress(raw: AbacusOrderAddress | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    address1: raw.Street || undefined,
    address2: raw.AddressLine2 || undefined,
    city: raw.City || undefined,
    region: raw.Region || undefined,
    postalCode: raw.PostalCode || undefined,
    country: (raw.CountryCode as Address['country']) || undefined,
  }
}

// ── Line items ────────────────────────────────────────────────────────────────

function mapPositions(positions: AbacusSalesOrderPosition[]): Lineitem[] {
  return (positions ?? []).map((p) => ({
    id: p.Id != null ? String(p.Id) : undefined,
    itemId: p.ArticleId != null ? String(p.ArticleId) : undefined,
    itemSku: p.ArticleNumber || undefined,
    itemDescription: p.Description || undefined,
    unitAmount: p.UnitPrice != null ? Math.round(p.UnitPrice * 100) : undefined,
    unitQuantity: p.Quantity != null ? Math.round(p.Quantity) : undefined,
    discountAmount: p.DiscountAmount != null ? Math.round(p.DiscountAmount * 100) : undefined,
    taxAmount: p.TaxAmount != null ? Math.round(p.TaxAmount * 100) : undefined,
    totalAmount: p.TotalPrice != null ? Math.round(p.TotalPrice * 100) : undefined,
  }))
}

// ── Main transform ────────────────────────────────────────────────────────────

/** Convert an Abacus sales order OData record to the canonical SalesOrder type. */
export function transformSalesOrder(raw: AbacusSalesOrder): SalesOrder {
  return {
    id: String(raw.Id),
    status: mapStatus(raw.Status),
    accountId: raw.AccountId != null ? String(raw.AccountId) : undefined,
    contactId: raw.CustomerId != null ? String(raw.CustomerId) : undefined,
    currency: raw.CurrencyCode || undefined,
    salesChannel: raw.SalesChannel || undefined,
    totalAmount: raw.TotalAmount != null ? Math.round(raw.TotalAmount * 100) : undefined,
    lineItems: raw.Positions ? mapPositions(raw.Positions) : undefined,
    billingAddress: mapAddress(raw.BillingAddress),
    shippingAddress: mapAddress(raw.ShippingAddress),
    postedAt: raw.OrderDate ? new Date(raw.OrderDate) : undefined,
    createdAt: raw.CreatedAt ? new Date(raw.CreatedAt) : undefined,
    updatedAt: raw.ModifiedAt ? new Date(raw.ModifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
