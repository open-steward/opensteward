/**
 * Transform a raw Tecsys OrderDynamics purchase-order response into the
 * canonical PurchaseOrder schema.
 *
 * OrderDynamics endpoint: GET /v1/orders/ (filtered by type=PO) or a
 * dedicated /v1/purchaseorders/ endpoint depending on tenant configuration.
 *
 * Key fields: InternalOrderId, ExternalOrderId, VendorId, Status, Currency,
 *   OrderTotal, SubTotal, DestinationLocationInternalName, OrderDate,
 *   ExpectedDeliveryDate, CompletedDate, Lines[].
 *
 * Monetary amounts from the API are decimal; we store as integer minor units.
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawTecsysPurchaseOrder {
  /** Tecsys internal order ID. */
  InternalOrderId: string
  /** Customer-facing order reference number. */
  ExternalOrderId?: string
  /** Vendor/supplier internal ID. */
  VendorId?: string
  /** Order status string. */
  Status?: string
  /** ISO 4217 currency code. */
  Currency?: string
  /** Order grand total (decimal, e.g. 123.45). */
  OrderTotal?: number
  /** Order subtotal before tax/shipping (decimal). */
  SubTotal?: number
  /** Destination inventory location internal name. */
  DestinationLocationInternalName?: string
  /** ISO 8601 date the PO was placed. */
  OrderDate?: string
  /** ISO 8601 expected delivery date. */
  ExpectedDeliveryDate?: string
  /** ISO 8601 date the PO was fully received/closed. */
  CompletedDate?: string
  /** Line items on this PO. */
  Lines?: Array<{
    Sku: string
    QuantityOrdered: number
    QuantityReceived?: number
    UnitCost?: number
    LineTotal?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined): PurchaseOrderStatus {
  switch ((s ?? '').toUpperCase()) {
    case 'DRAFT':
    case 'PENDING':
      return 'draft'
    case 'SUBMITTED':
    case 'ORDERED':
    case 'APPROVED':
      return 'sent'
    case 'PARTIALLY RECEIVED':
    case 'PARTIALLYRECEIVED':
      return 'partially_received'
    case 'RECEIVED':
      return 'received'
    case 'COMPLETED':
    case 'CLOSED':
      return 'closed'
    case 'CANCELLED':
    case 'VOIDED':
      return 'cancelled'
    default:
      return 'draft'
  }
}

export function transformPurchaseOrder(raw: RawTecsysPurchaseOrder): PurchaseOrder {
  // Convert decimal amounts to integer minor units (cents)
  const subtotalMinor =
    raw.SubTotal !== undefined ? Math.round(raw.SubTotal * 100) : undefined
  const totalMinor =
    raw.OrderTotal !== undefined ? Math.round(raw.OrderTotal * 100) : undefined

  return {
    id: raw.InternalOrderId,
    externalId: raw.ExternalOrderId ?? raw.InternalOrderId,
    number: pickStr(raw.ExternalOrderId),
    supplierId: raw.VendorId ?? '',
    destinationLocationId: pickStr(raw.DestinationLocationInternalName),
    status: mapStatus(raw.Status),
    currency: pickStr(raw.Currency),
    subtotalAmount: subtotalMinor,
    totalAmount: totalMinor,
    lines: (raw.Lines ?? []).map((l) => ({
      productId: l.Sku,
      quantityOrdered: l.QuantityOrdered,
      quantityReceived: l.QuantityReceived,
      unitCost: l.UnitCost !== undefined ? Math.round(l.UnitCost * 100) : undefined,
      lineTotal: l.LineTotal !== undefined ? Math.round(l.LineTotal * 100) : undefined,
    })),
    expectedAt: toIso(raw.ExpectedDeliveryDate),
    orderedAt: toIso(raw.OrderDate),
    receivedAt: toIso(raw.CompletedDate),
    platform: 'tecsys',
    metadata: strMap({ rawStatus: raw.Status }),
    raw,
  }
}
