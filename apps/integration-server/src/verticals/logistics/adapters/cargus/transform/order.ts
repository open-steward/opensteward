import type { Order } from '../../../schema/order'
import { toISODate } from '../../shared/transform'

/**
 * A courier pickup order as the first-party portal documents it for
 * `Orders_GetByDate` ("Get Orders by date with pagination") and
 * `Orders_GetByOrderId` ("Get Orders by Id"):
 * https://urgentcargus.developer.azure-api.net/api-details#api=55acb9ae5f80b911a8f59a5f&operation=Orders_GetByDate
 *
 *   {"OrderId":0,"LocationId":0,"PickUpSiteName":"string","PickupStartDate":"string",
 *    "PickupEndDate":"string","NoParcel":0,"NoEnvelop":0,"TotalWeight":0,"NoAwb":0,
 *    "Observations":"string","PackageContent":"string","CreationDate":"string",
 *    "ValidationDate":"string","ProcessedDate":"string","OrdStatus":0,
 *    "OrdStatusDetails":"string","AdresaExp":"string","Email":"string","OrderType":0}
 *
 * `OrdStatus` is documented only as an integer, with no values, so the
 * canonical status is `unknown` (the raw value stays in `metadata`).
 * `LocationId` is the pickup location, which is this adapter's Warehouse id.
 */
export interface CargusOrder {
  OrderId?: number | null
  LocationId?: number | null
  Observations?: string | null
  CreationDate?: string | null
  OrdStatus?: number | null
  [key: string]: unknown
}

export function transformOrder(raw: CargusOrder): Order {
  if (raw.OrderId == null) throw new Error('Cargus order without an OrderId')
  const id = String(raw.OrderId)
  return {
    id,
    orderNumber: id,
    status: 'unknown',
    warehouseId: raw.LocationId != null ? String(raw.LocationId) : undefined,
    notes: raw.Observations || undefined,
    orderAt: toISODate(raw.CreationDate),
    createdAt: toISODate(raw.CreationDate),
    metadata: raw as Record<string, unknown>,
  }
}
