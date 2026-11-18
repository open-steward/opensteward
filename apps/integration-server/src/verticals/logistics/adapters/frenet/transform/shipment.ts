import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toWeight, toDimensions, parseDecimal } from '../../shared/transform'
import { toIsoDatetime } from '@opensteward/shared'
import { transformAddress, type FrenetAddress } from './address'

/**
 * Frenet shipment/order record returned from GET /shipments/{id} and
 * GET /orders/{id}.
 */
export interface FrenetShipment {
  ShipmentId?: string | null
  OrderNumber?: string | null
  /** Shipping service description */
  ServiceDescription?: string | null
  /** Carrier name */
  Carrier?: string | null
  /** Carrier code */
  CarrierCode?: string | null
  /** Tracking number */
  TrackingNumber?: string | null
  /** Current status string */
  Status?: string | null
  /** Weight in kg */
  Weight?: number | string | null
  /** Height in cm */
  Height?: number | string | null
  /** Width in cm */
  Width?: number | string | null
  /** Length/depth in cm */
  Length?: number | string | null
  /** Declared/invoice value in BRL */
  InvoiceValue?: number | string | null
  /** Shipping cost in BRL */
  ShippingPrice?: number | string | null
  /** Label URL */
  LabelUrl?: string | null
  DestinationAddress?: FrenetAddress | null
  OriginAddress?: FrenetAddress | null
  CreatedDate?: string | null
  UpdatedDate?: string | null
  [key: string]: unknown
}

/**
 * Map Frenet status strings to canonical ShipmentStatus values.
 * Frenet statuses are in Portuguese and correspond to Brazil Post (Correios) codes.
 */
function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('entregue') || s.includes('delivered')) return 'DELIVERED'
  if (s.includes('saiu para entrega') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('em transit') || s.includes('trânsito') || s.includes('transito'))
    return 'IN_TRANSIT'
  if (
    s.includes('etiqueta') ||
    s.includes('label') ||
    s.includes('postado') ||
    s.includes('posted')
  )
    return 'LABEL_CREATED'
  if (s.includes('devolvido') || s.includes('retorno') || s.includes('return')) return 'RETURNED'
  if (s.includes('cancelado') || s.includes('cancel')) return 'CANCELLED'
  if (
    s.includes('extravio') ||
    s.includes('avaria') ||
    s.includes('exception') ||
    s.includes('erro')
  )
    return 'EXCEPTION'
  if (s.includes('aguardando') || s.includes('pending')) return 'PENDING'
  return 'UNKNOWN'
}

export function transformShipment(raw: FrenetShipment): Shipment {
  const shippingPrice = parseDecimal(raw.ShippingPrice)

  return {
    id: raw.ShipmentId ?? undefined,
    status: mapShipmentStatus(raw.Status),
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: raw.Carrier ?? undefined,
    serviceCode: raw.CarrierCode ?? undefined,
    originAddress: transformAddress(raw.OriginAddress),
    destinationAddress: transformAddress(raw.DestinationAddress),
    totalWeight: toWeight(raw.Weight, 'kg'),
    dimensions: toDimensions(raw.Length, raw.Width, raw.Height, 'cm'),
    labelUrl: raw.LabelUrl ?? undefined,
    cost:
      shippingPrice != null
        ? { amount: Math.round(shippingPrice * 100), currency: 'BRL' }
        : undefined,
    reference: raw.OrderNumber ?? undefined,
    createdAt: toIsoDatetime(raw.CreatedDate)
      ? new Date(toIsoDatetime(raw.CreatedDate)!)
      : undefined,
    updatedAt: toIsoDatetime(raw.UpdatedDate)
      ? new Date(toIsoDatetime(raw.UpdatedDate)!)
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
