import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions } from '../../shared/transform'
import {
  transformAddress,
  type CdekLocation,
  type CdekContact,
} from './address'

/**
 * Raw CDEK package (place/cargo) object.
 * Dimensions in cm, weight in grams.
 */
export interface CdekPackage {
  number?: string | null
  weight?: number | null     // grams
  length?: number | null     // cm
  width?: number | null      // cm
  height?: number | null     // cm
  comment?: string | null
  [key: string]: unknown
}

/**
 * Raw CDEK order/shipment as returned by GET /orders/{uuid} or POST /orders.
 */
export interface CdekOrder {
  uuid?: string | null
  cdek_number?: string | null
  number?: string | null
  type?: number | null
  tariff_code?: number | null
  comment?: string | null
  shipment_point?: string | null
  delivery_point?: string | null
  from_location?: CdekLocation | null
  to_location?: CdekLocation | null
  sender?: CdekContact | null
  recipient?: CdekContact | null
  packages?: CdekPackage[] | null
  delivery_mode?: string | null
  delivery_detail?: {
    delivery_sum?: number | null
    currency_code?: string | null
    date?: string | null
    [key: string]: unknown
  } | null
  statuses?: Array<{
    code?: string | null
    name?: string | null
    date_time?: string | null
    city?: string | null
    [key: string]: unknown
  }> | null
  date_invoice?: string | null
  date_created?: string | null
  date_updated?: string | null
  entity?: {
    uuid?: string | null
    [key: string]: unknown
  } | null
  requests?: Array<{
    state?: string | null
    [key: string]: unknown
  }> | null
  [key: string]: unknown
}

/**
 * Map CDEK status codes to canonical ShipmentStatus values.
 *
 * CDEK status codes (partial list):
 *   CREATED       – order registered
 *   ACCEPTED      – accepted at warehouse
 *   RECEIVED_AT_SENDER_WAREHOUSE – received at origin depot
 *   RETURNED_TO_SENDER_CITY_WAREHOUSE – returned
 *   READY_FOR_DELIVERY – out for delivery
 *   DELIVERED     – delivered
 *   NOT_DELIVERED – delivery failed
 *   CANCELLED     – order cancelled
 *   POSTOMAT_POSTED – posted to parcel locker
 *   POSTOMAT_RECEIVED – picked up from parcel locker
 */
function mapShipmentStatus(code: string | null | undefined): ShipmentStatus {
  switch ((code ?? '').toUpperCase()) {
    case 'CREATED':
    case 'ACCEPTED':
      return 'LABEL_CREATED'
    case 'RECEIVED_AT_SENDER_WAREHOUSE':
    case 'SENDER_CITY_POSTOMAT':
    case 'ARRIVED_AT_SENDER_CITY_WAREHOUSE':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'ARRIVED_AT_RECEIVER_CITY_WAREHOUSE':
    case 'IN_CUSTOMS':
    case 'CUSTOMS_CLEARED':
      return 'IN_TRANSIT'
    case 'READY_FOR_DELIVERY':
    case 'DELIVERY_RESCHEDULED':
    case 'POSTOMAT_POSTED':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
    case 'POSTOMAT_RECEIVED':
      return 'DELIVERED'
    case 'NOT_DELIVERED':
    case 'STORAGE_EXPIRED':
      return 'EXCEPTION'
    case 'RETURNED_TO_SENDER':
    case 'RETURNED_TO_SENDER_CITY_WAREHOUSE':
      return 'RETURNED'
    case 'CANCELLED':
    case 'CANCEL_PICKUP':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: CdekOrder): Shipment {
  // Latest status is the last element in the statuses array.
  const statuses = raw.statuses ?? []
  const latestStatus = statuses.length > 0 ? statuses[statuses.length - 1] : undefined

  const pkg = raw.packages?.[0] ?? undefined

  // Weight in grams → canonical kg
  const weightValue =
    pkg?.weight != null
      ? pkg.weight
      : undefined

  const totalWeight = weightValue != null ? toWeight(weightValue / 1000, 'kg') : undefined

  const dimensions =
    pkg?.length != null && pkg?.width != null && pkg?.height != null
      ? toDimensions(pkg.length, pkg.width, pkg.height, 'cm')
      : undefined

  return {
    id: raw.uuid ?? raw.cdek_number ?? undefined,
    status: mapShipmentStatus(latestStatus?.code),
    trackingNumber: raw.cdek_number ?? undefined,
    carrierId: 'cdek',
    serviceCode: raw.tariff_code != null ? String(raw.tariff_code) : undefined,
    originAddress: transformAddress(raw.from_location, raw.sender),
    destinationAddress: transformAddress(raw.to_location, raw.recipient),
    totalWeight,
    dimensions,
    reference: raw.number ?? undefined,
    cost: raw.delivery_detail?.delivery_sum != null
      ? {
          amount: raw.delivery_detail.delivery_sum,
          currency: (raw.delivery_detail.currency_code ?? 'RUB') as string,
        }
      : undefined,
    createdAt: toISODate(raw.date_created),
    updatedAt: toISODate(raw.date_updated),
    metadata: raw as Record<string, unknown>,
  }
}
