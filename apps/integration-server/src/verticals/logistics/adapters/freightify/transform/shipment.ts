import type { Shipment, ShipmentStatus, ShipmentMode } from '../../../schema/shipment'
import { toISODate, toAddress, parseDecimal } from '../../shared/transform'

/**
 * Freightify shipment / booking record.
 * Freightify is an ocean freight rate management platform so shipments
 * map to container bookings on ocean sailing schedules.
 */
export interface FreightifyShipment {
  id: string
  booking_number?: string | null
  bill_of_lading?: string | null
  container_number?: string | null
  container_type?: string | null
  status?: string | null
  mode?: string | null            // 'FCL' | 'LCL'
  carrier_name?: string | null
  carrier_scac?: string | null
  service_code?: string | null
  vessel_name?: string | null
  voyage_number?: string | null
  port_of_loading?: string | null       // UN/LOCODE
  port_of_discharge?: string | null     // UN/LOCODE
  estimated_departure?: string | null
  estimated_arrival?: string | null
  actual_departure?: string | null
  actual_arrival?: string | null
  origin_address?: Record<string, unknown> | null
  destination_address?: Record<string, unknown> | null
  total_weight?: number | null          // kg
  total_volume?: number | null          // CBM
  freight_amount?: number | null
  currency?: string | null
  reference?: string | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'draft':
    case 'quote':              return 'PENDING'
    case 'booked':
    case 'confirmed':          return 'LABEL_CREATED'
    case 'in_transit':
    case 'at_sea':
    case 'departed':           return 'IN_TRANSIT'
    case 'arrived':
    case 'at_port':
    case 'out_for_delivery':   return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'completed':          return 'DELIVERED'
    case 'cancelled':          return 'CANCELLED'
    case 'exception':
    case 'failed':             return 'EXCEPTION'
    case 'returned':           return 'RETURNED'
    default:                   return 'UNKNOWN'
  }
}

function mapShipmentMode(mode: string | null | undefined): ShipmentMode {
  switch ((mode ?? '').toLowerCase()) {
    case 'fcl':
    case 'lcl':
    case 'ocean':              return 'ocean'
    case 'air':                return 'air'
    default:                   return 'ocean'  // Freightify is ocean-focused
  }
}

export function transformShipment(raw: FreightifyShipment): Shipment {
  const freightAmount = parseDecimal(raw.freight_amount)

  return {
    id: raw.id,
    status: mapShipmentStatus(raw.status),
    mode: mapShipmentMode(raw.mode),
    trackingNumber: raw.container_number ?? raw.booking_number ?? undefined,
    carrierId: raw.carrier_scac ?? raw.carrier_name ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress(raw.origin_address),
    destinationAddress: toAddress(raw.destination_address),
    cost:
      freightAmount !== undefined && raw.currency
        ? { amount: freightAmount, currency: raw.currency }
        : undefined,
    reference: raw.booking_number ?? raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_arrival),
    actualDeliveryAt: toISODate(raw.actual_arrival),
    ocean: {
      containerNumber: raw.container_number ?? undefined,
      containerType: raw.container_type ?? undefined,
      bookingNumber: raw.booking_number ?? undefined,
      billOfLadingNumber: raw.bill_of_lading ?? undefined,
      vesselName: raw.vessel_name ?? undefined,
      voyageNumber: raw.voyage_number ?? undefined,
      shippingLine: raw.carrier_name ?? undefined,
      portOfLoading: raw.port_of_loading ?? undefined,
      portOfDischarge: raw.port_of_discharge ?? undefined,
      estimatedDeparture: toISODate(raw.estimated_departure),
      estimatedArrival: toISODate(raw.estimated_arrival),
      actualDeparture: toISODate(raw.actual_departure),
      actualArrival: toISODate(raw.actual_arrival),
    },
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
