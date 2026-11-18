/**
 * Infoplus parcelShipment → canonical Shipment transform.
 *
 * Fields read, all from the `parcelShipment` definition in the v2.0 swagger
 * (https://developer.infopluscommerce.com/api/reference/v2.0/swagger.json):
 *
 *   id (integer)            → id
 *   trackingNo (string)     → trackingNumber
 *   warehouseId (integer)   → warehouseId
 *   orderNo (number)        → reference (the order this parcel ships)
 *   weightLbs (number)      → totalWeight, in lb as the field name states
 *   deliveredDate (date-time) → actualDeliveryAt
 *   shipped (boolean), deliveredDate → status (see below)
 *   createDate / modifyDate → createdAt / updatedAt
 *
 * Not mapped: `status` is a free string whose values the swagger does not
 * enumerate; `chargedFreightAmount` and the other amounts carry no currency;
 * `carrierServiceId` is an Infoplus record id, not a service code; the
 * definition names no carrier and no label URL. Everything stays in
 * `metadata`.
 */

import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight } from '../../shared/transform'

export interface InfoplusParcelShipment {
  id?: number | null
  createDate?: string | null
  modifyDate?: string | null
  shipDate?: string | null
  deliveredDate?: string | null
  trackingNo?: string | null
  warehouseId?: number | null
  lobId?: number | null
  orderNo?: number | null
  status?: string | null
  shipped?: boolean | null
  carrierServiceId?: number | null
  weightLbs?: number | null
  [key: string]: unknown
}

/**
 * Only the two documented facts are read: a `deliveredDate` means delivered,
 * and `shipped: true` without one means on its way. The free-text `status`
 * has no documented values, so anything else is UNKNOWN.
 */
function mapStatus(raw: InfoplusParcelShipment): ShipmentStatus {
  if (toISODate(raw.deliveredDate)) return 'DELIVERED'
  if (raw.shipped === true) return 'IN_TRANSIT'
  return 'UNKNOWN'
}

export function transformShipment(raw: InfoplusParcelShipment): Shipment {
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    status: mapStatus(raw),
    trackingNumber: raw.trackingNo || undefined,
    warehouseId: raw.warehouseId != null ? String(raw.warehouseId) : undefined,
    reference: raw.orderNo != null ? String(raw.orderNo) : undefined,
    totalWeight: raw.weightLbs != null ? toWeight(raw.weightLbs, 'lb') : undefined,
    actualDeliveryAt: toISODate(raw.deliveredDate),
    createdAt: toISODate(raw.createDate),
    updatedAt: toISODate(raw.modifyDate),
    metadata: raw as Record<string, unknown>,
  }
}
