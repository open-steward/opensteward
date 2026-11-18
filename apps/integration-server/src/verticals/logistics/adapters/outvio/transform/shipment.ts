import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal } from '../../shared/transform'
import { transformAddress, type OutvioAddress } from './address'

/**
 * Raw Outvio shipment object as returned by GET /v1/shipments/:id and
 * GET /v1/shipments (list).
 *
 * Field names follow the Outvio REST API conventions. Optional/unknown
 * fields use `[key: string]: unknown` to accommodate API evolution without
 * breaking TypeScript compilation.
 */
export interface OutvioShipment {
  id: string
  reference?: string | null
  /** Outvio lifecycle status: pending, processing, shipped, delivered, returned, cancelled, exception */
  status?: string | null
  trackingNumber?: string | null
  tracking_number?: string | null
  carrierId?: string | null
  carrier?: string | null
  serviceCode?: string | null
  service_code?: string | null
  originAddress?: OutvioAddress | null
  origin_address?: OutvioAddress | null
  destinationAddress?: OutvioAddress | null
  destination_address?: OutvioAddress | null
  returnAddress?: OutvioAddress | null
  return_address?: OutvioAddress | null
  weight?: number | null
  weightUnit?: string | null
  weight_unit?: string | null
  length?: number | null
  width?: number | null
  height?: number | null
  dimensionUnit?: string | null
  dimension_unit?: string | null
  labelUrl?: string | null
  label_url?: string | null
  cost?: number | null
  currency?: string | null
  estimatedDeliveryDate?: string | null
  estimated_delivery_date?: string | null
  actualDeliveryDate?: string | null
  actual_delivery_date?: string | null
  orderId?: string | null
  order_id?: string | null
  notes?: string | null
  createdAt?: string | null
  created_at?: string | null
  updatedAt?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'processing':
    case 'label_created':
      return 'LABEL_CREATED'
    case 'shipped':
    case 'in_transit':
    case 'intransit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'out for delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'returned':
    case 'return_to_sender':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'exception':
    case 'failed':
    case 'failure':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: OutvioShipment): Shipment {
  const trackingNumber = raw.trackingNumber ?? raw.tracking_number ?? undefined
  const carrierId = raw.carrierId ?? raw.carrier ?? undefined
  const serviceCode = raw.serviceCode ?? raw.service_code ?? undefined
  const originAddr = raw.originAddress ?? raw.origin_address
  const destAddr = raw.destinationAddress ?? raw.destination_address
  const returnAddr = raw.returnAddress ?? raw.return_address
  const weightVal = raw.weight ?? undefined
  const weightUnit = (raw.weightUnit ?? raw.weight_unit ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  const dimUnit = (raw.dimensionUnit ?? raw.dimension_unit ?? 'cm') as 'in' | 'cm'
  const labelUrl = raw.labelUrl ?? raw.label_url ?? undefined
  const cost = parseDecimal(raw.cost)
  const currency = raw.currency ?? 'EUR'
  const createdAt = toISODate(raw.createdAt ?? raw.created_at)
  const updatedAt = toISODate(raw.updatedAt ?? raw.updated_at)
  const estimatedDeliveryAt = toISODate(raw.estimatedDeliveryDate ?? raw.estimated_delivery_date)
  const actualDeliveryAt = toISODate(raw.actualDeliveryDate ?? raw.actual_delivery_date)

  return {
    id: raw.id,
    status: mapShipmentStatus(raw.status),
    trackingNumber,
    carrierId,
    serviceCode,
    originAddress: transformAddress(originAddr),
    destinationAddress: transformAddress(destAddr),
    returnAddress: transformAddress(returnAddr),
    totalWeight: toWeight(weightVal, weightUnit),
    dimensions:
      raw.length != null && raw.width != null && raw.height != null
        ? toDimensions(raw.length, raw.width, raw.height, dimUnit)
        : undefined,
    labelUrl: labelUrl ?? undefined,
    cost:
      cost !== undefined
        ? { amount: cost, currency }
        : undefined,
    reference: raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    estimatedDeliveryAt,
    actualDeliveryAt,
    createdAt,
    updatedAt,
    metadata: raw as Record<string, unknown>,
  }
}
