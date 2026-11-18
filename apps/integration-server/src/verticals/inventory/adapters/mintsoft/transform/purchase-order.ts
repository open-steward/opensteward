import type { PurchaseOrder } from '../../../schema'
import { pickStr, strMap, toIso } from './shared'

/**
 * Mintsoft ASN (Advanced Shipping Notice): Mintsoft's inbound purchase order,
 * a supplier delivery advised into the warehouse.
 *
 * Returned by GET /api/ASN/List (with `IncludeASNItems=true`) and
 * GET /api/ASN/{id}. Every field below is a property of the `ASN` and
 * `ASNItem` definitions in the first-party Swagger 2.0 spec,
 * https://api.mintsoft.co.uk/swagger/docs/v1. Note the spec's own spelling
 * `QuantityReceieved`.
 */
export interface RawMintsoftASNItem {
  ID?: number
  ASNId?: number
  ProductId?: number
  SKU?: string
  QuantityExpected?: number
  QuantityReceieved?: number
  QuantityBooked?: number
  [key: string]: unknown
}

export interface RawMintsoftASN {
  ID: number
  POReference?: string
  Supplier?: string
  ProductSupplierId?: number
  ProductSupplier?: string
  WarehouseId?: number
  ClientId?: number
  ASNStatus?: { ID?: number; Name?: string }
  ASNStatusId?: number
  EstimatedDelivery?: string
  BookedInDate?: string
  Comments?: string
  GoodsInType?: string
  LastUpdated?: string
  Items?: RawMintsoftASNItem[]
  [key: string]: unknown
}

function requireInt(value: unknown, what: string, asnId: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`mintsoft ASN ${asnId} has no ${what}`)
  }
  return value
}

/**
 * The spec's GET /api/ASN/Statuses is "a list of Possible ASNStatusIds and
 * Names within the system": the names are per account and no value is
 * documented, so the canonical status is 'unknown'. The platform's own status
 * id and name are kept in metadata.
 */
export function transformPurchaseOrder(raw: RawMintsoftASN): PurchaseOrder {
  const idStr = String(raw.ID)
  const supplierId = String(requireInt(raw.ProductSupplierId, 'ProductSupplierId', raw.ID))

  return {
    id: idStr,
    externalId: idStr,
    number: pickStr(raw.POReference),
    supplierId,
    destinationLocationId: raw.WarehouseId !== undefined ? String(raw.WarehouseId) : undefined,
    status: 'unknown',
    lines: (raw.Items ?? []).map((item) => ({
      productId: String(requireInt(item.ProductId, 'item ProductId', raw.ID)),
      quantityOrdered: requireInt(item.QuantityExpected, 'item QuantityExpected', raw.ID),
      quantityReceived:
        typeof item.QuantityReceieved === 'number' ? item.QuantityReceieved : undefined,
    })),
    expectedAt: toIso(raw.EstimatedDelivery),
    receivedAt: toIso(raw.BookedInDate),
    platform: 'mintsoft',
    metadata: strMap({
      clientId: raw.ClientId,
      supplier: raw.Supplier,
      goodsInType: raw.GoodsInType,
      comments: raw.Comments,
      asnStatusId: raw.ASNStatusId,
      asnStatus: raw.ASNStatus?.Name,
      lastUpdated: raw.LastUpdated,
    }),
    raw,
  }
}
