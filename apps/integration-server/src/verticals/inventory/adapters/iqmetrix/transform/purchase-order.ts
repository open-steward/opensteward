/**
 * iQmetrix Purchase Orders API — purchase-order transform.
 *
 * Source: POST /rqpurchaseorders/Companies/{CompanyId}/PurchaseOrders
 *         (create) — the API is primarily write-oriented.
 *
 * iQmetrix Purchase Orders are submitted to the RQ POS system. The request
 * body fields are used here as the canonical "raw" shape since the API is
 * write-heavy. A GET for existing POs is not publicly documented; we model
 * the shape from the documented creation payload.
 *
 * Key request/response fields:
 *   PurchaseOrderGuid        — UUID (we use as our id)
 *   VendorEntityId           — integer supplier entity
 *   OrdererStoreEntityId     — origin location
 *   ReceiverStoreEntityId    — destination location (same or different store)
 *   EstimatedArrivalDate     — ISO date string
 *   ShippingCost             — decimal (dollars)
 *   Committed                — boolean
 *   ReferenceNumber          — optional external reference
 *   Products                 — array of { VendorSKU, Quantity, UnitCost? }
 */
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema'
import {pickStr, strMap, toIso} from './shared'

export interface RawIqmetrixPurchaseOrder {
  PurchaseOrderGuid?: string
  /** RQ integer ID assigned after creation */
  PurchaseOrderId?: number
  VendorEntityId?: number
  OrdererStoreEntityId?: number
  ReceiverStoreEntityId?: number
  BillToStoreEntityId?: number
  EstimatedArrivalDate?: string
  ShippingCost?: number
  Committed?: boolean
  ReferenceNumber?: string
  /** Status string from RQ system */
  Status?: string
  Products?: Array<{
    VendorSKU?: string
    CatalogItemId?: string
    Quantity?: number
    QuantityReceived?: number
    UnitCost?: number
    LineTotal?: number
  }>
  [key: string]: unknown
}

function mapStatus(s: string | undefined, committed: boolean | undefined): PurchaseOrderStatus {
  const upper = (s ?? '').toUpperCase()
  if (upper === 'RECEIVED' || upper === 'COMPLETE') return 'received'
  if (upper === 'PARTIALLYRECEIVED' || upper === 'PARTIAL') return 'partially_received'
  if (upper === 'CANCELLED' || upper === 'VOIDED') return 'cancelled'
  if (committed) return 'sent'
  return 'draft'
}

export function transformPurchaseOrder(raw: RawIqmetrixPurchaseOrder): PurchaseOrder {
  // Use GUID as primary id; fall back to integer PurchaseOrderId as string
  const id = pickStr(raw.PurchaseOrderGuid)
    ?? (raw.PurchaseOrderId !== undefined ? String(raw.PurchaseOrderId) : '')

  // Shipping cost in minor units (cents)
  const shippingCents = raw.ShippingCost !== undefined
    ? Math.round(raw.ShippingCost * 100)
    : undefined

  return {
    id,
    externalId:            id,
    number:                pickStr(raw.ReferenceNumber) ?? pickStr(raw.PurchaseOrderGuid),
    supplierId:            raw.VendorEntityId !== undefined ? String(raw.VendorEntityId) : '',
    destinationLocationId: raw.ReceiverStoreEntityId !== undefined
      ? String(raw.ReceiverStoreEntityId)
      : (raw.OrdererStoreEntityId !== undefined ? String(raw.OrdererStoreEntityId) : undefined),
    status:                mapStatus(raw.Status, raw.Committed),
    expectedAt:            toIso(raw.EstimatedArrivalDate),
    lines: (raw.Products ?? []).map((p) => ({
      productId:        pickStr(p.CatalogItemId) ?? pickStr(p.VendorSKU) ?? '',
      quantityOrdered:  p.Quantity ?? 0,
      quantityReceived: p.QuantityReceived,
      // iQmetrix UnitCost is a decimal dollar amount — store as minor units
      unitCost:         p.UnitCost !== undefined ? Math.round(p.UnitCost * 100) : undefined,
      lineTotal:        p.LineTotal !== undefined ? Math.round(p.LineTotal * 100) : undefined,
    })),
    platform: 'iqmetrix',
    metadata: strMap({
      shippingCents,
      committed:       raw.Committed,
      ordererStoreId:  raw.OrdererStoreEntityId,
    }),
    raw,
  }
}
