import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toDimensions } from '../../shared/transform'
import { transformAddress, type UnifiedAddress } from './address'

/** Unified.to ShippingPackage shape. */
export interface UnifiedShippingPackage {
  trackingNumber?: string | null
  weight?: number | null
  weightUnit?: string | null
  length?: number | null
  width?: number | null
  height?: number | null
  sizeUnit?: string | null
  description?: string | null
  insuredAmount?: number | null
  value?: number | null
  currency?: string | null
  [key: string]: unknown
}

/** Unified.to ShippingShipment response shape. */
export interface UnifiedShippingShipment {
  id?: string | null
  status?: string | null
  trackingId?: string | null
  labelId?: string | null
  carrierId?: string | null
  serviceCode?: string | null
  rateAmount?: number | null
  rateCurrency?: string | null
  rateEstimatedDays?: number | null
  rateEstimatedDeliveryAt?: string | Date | null
  rateId?: string | null
  rateServiceName?: string | null
  referenceNumber?: string | null
  orderId?: string | null
  originalShipmentId?: string | null
  fromAddress?: UnifiedAddress | null
  toAddress?: UnifiedAddress | null
  returnAddress?: UnifiedAddress | null
  packages?: UnifiedShippingPackage[] | null
  isReturn?: boolean | null
  isInternational?: boolean | null
  isAdultSignatureRequired?: boolean | null
  isSignatureRequired?: boolean | null
  isRateGuaranteed?: boolean | null
  warehouseLocationId?: string | null
  warehouseLocationName?: string | null
  shippedAt?: string | Date | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  raw?: Record<string, unknown> | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'PENDING':               return 'PENDING'
    case 'LABEL_CREATED':         return 'LABEL_CREATED'
    case 'PROCESSING':            return 'LABEL_CREATED'
    case 'PICKED_UP':             return 'IN_TRANSIT'
    case 'IN_TRANSIT':            return 'IN_TRANSIT'
    case 'CUSTOMS_CLEARANCE':     return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':      return 'OUT_FOR_DELIVERY'
    case 'DELIVERY_ATTEMPTED':    return 'OUT_FOR_DELIVERY'
    case 'HELD_AT_LOCATION':      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':             return 'DELIVERED'
    case 'EXCEPTION':             return 'EXCEPTION'
    case 'EXCEPTION_RESOLVED':    return 'EXCEPTION'
    case 'RETURNED_TO_SENDER':    return 'RETURNED'
    case 'CANCELLED':             return 'CANCELLED'
    default:                      return 'UNKNOWN'
  }
}

export function transformShipment(raw: UnifiedShippingShipment): Shipment {
  // Pick the first package for weight/dimensions summary
  const firstPkg = (raw.packages ?? [])[0]

  // Determine dimension unit — Unified uses 'in' | 'cm'; default to 'in'
  const sizeUnit = (firstPkg?.sizeUnit as 'in' | 'cm' | undefined) ?? 'in'
  const weightUnit = (firstPkg?.weightUnit as 'oz' | 'lb' | 'g' | 'kg' | undefined) ?? 'oz'

  const dimensions =
    firstPkg?.length != null && firstPkg?.width != null && firstPkg?.height != null
      ? toDimensions(firstPkg.length, firstPkg.width, firstPkg.height, sizeUnit)
      : undefined

  const totalWeight =
    firstPkg?.weight != null
      ? { value: firstPkg.weight, unit: weightUnit }
      : undefined

  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingId ?? undefined,
    carrierId: raw.carrierId ?? undefined,
    serviceCode: raw.serviceCode ?? (raw.rateServiceName ?? undefined),
    warehouseId: raw.warehouseLocationId ?? undefined,
    originAddress: transformAddress(raw.fromAddress),
    destinationAddress: transformAddress(raw.toAddress),
    returnAddress: transformAddress(raw.returnAddress),
    totalWeight,
    dimensions,
    estimatedDeliveryAt: toISODate(raw.rateEstimatedDeliveryAt),
    labelUrl: undefined,
    cost:
      raw.rateAmount != null
        ? {
            amount: raw.rateAmount,
            currency: raw.rateCurrency ?? 'USD',
          }
        : undefined,
    reference: raw.referenceNumber ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
