import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal } from '../../shared/transform'
import { transformAddress, type IMileAddress } from './address'

/**
 * iMile shipment / waybill object.
 *
 * iMile uses "waybillNo" as the carrier tracking number and "orderNo" as the
 * merchant reference.  Status codes follow a numeric/string scheme that maps
 * onto the canonical ShipmentStatus enum below.
 */
export interface IMileShipment {
  /** iMile internal shipment / waybill identifier. */
  waybillNo?: string | null
  /** Merchant order reference. */
  orderNo?: string | null
  /** Shipment status code (string or numeric). */
  status?: string | number | null
  /** Human-readable status description. */
  statusDesc?: string | null
  /** Carrier service type code. */
  serviceType?: string | null
  senderAddress?: IMileAddress | null
  receiverAddress?: IMileAddress | null
  /** Shipment weight in kilograms. */
  weight?: number | string | null
  /** Length in centimetres. */
  length?: number | string | null
  /** Width in centimetres. */
  width?: number | string | null
  /** Height in centimetres. */
  height?: number | string | null
  /** URL of the generated label (PDF). */
  labelUrl?: string | null
  /** Shipping cost amount. */
  freight?: number | string | null
  /** Currency code, e.g. "AED". */
  currency?: string | null
  /** Estimated delivery date (ISO-8601 or similar). */
  estimatedDeliveryTime?: string | null
  /** Actual delivery timestamp. */
  actualDeliveryTime?: string | null
  createdTime?: string | null
  updatedTime?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | number | null | undefined): ShipmentStatus {
  const s = String(status ?? '').toUpperCase()
  switch (s) {
    case 'CREATED':
    case 'LABEL_CREATED':
    case '0':
    case 'PENDING':
      return 'LABEL_CREATED'
    case 'PICKED_UP':
    case 'COLLECTED':
    case 'IN_TRANSIT':
    case '1':
    case '2':
    case '3':
    case 'TRANSIT':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
    case 'OUT_DELIVERY':
    case '4':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
    case '5':
      return 'DELIVERED'
    case 'RETURNED':
    case 'RETURN_TO_SENDER':
    case '6':
    case 'RETURNING':
      return 'RETURNED'
    case 'CANCELLED':
    case 'CANCELED':
    case '7':
      return 'CANCELLED'
    case 'EXCEPTION':
    case 'FAILED':
    case 'FAILURE':
    case '8':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: IMileShipment): Shipment {
  return {
    id: raw.waybillNo ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.waybillNo ?? undefined,
    carrierId: 'imile',
    serviceCode: raw.serviceType ?? undefined,
    originAddress: raw.senderAddress ? transformAddress(raw.senderAddress) : undefined,
    destinationAddress: raw.receiverAddress ? transformAddress(raw.receiverAddress) : undefined,
    totalWeight: toWeight(raw.weight, 'kg'),
    dimensions: toDimensions(raw.length, raw.width, raw.height, 'cm'),
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryTime),
    actualDeliveryAt: toISODate(raw.actualDeliveryTime),
    labelUrl: raw.labelUrl ?? undefined,
    cost:
      raw.freight != null
        ? {
            amount: parseDecimal(raw.freight) ?? 0,
            currency: raw.currency ?? 'AED',
          }
        : undefined,
    reference: raw.orderNo ?? undefined,
    createdAt: toISODate(raw.createdTime),
    updatedAt: toISODate(raw.updatedTime),
    metadata: raw as Record<string, unknown>,
  }
}
