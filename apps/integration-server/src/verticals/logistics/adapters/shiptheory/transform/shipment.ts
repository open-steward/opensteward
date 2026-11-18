import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import { transformAddress, type ShiptheoryAddress } from './address'

export interface ShiptheoryProduct {
  name?: string | null
  sku?: string | null
  qty?: number | null
  value?: number | null
  weight?: number | null
  [key: string]: unknown
}

export interface ShiptheoryShipment {
  // Core identification
  channel_reference_id?: string | null
  channel_reference_id_2?: string | null
  channel_reference_id_3?: string | null

  // Status
  status?: string | null

  // Carrier result
  tracking_number?: string | null
  carrier?: string | null
  carrier_name?: string | null
  service_name?: string | null

  // Label (base64 PDF)
  label?: string | null

  // Recipient / sender addresses
  recipient?: ShiptheoryAddress | null
  sender?: ShiptheoryAddress | null

  // Weight / dimensions
  weight?: number | null
  parcels?: number | null
  value?: number | null

  // Dates
  created_at?: string | null
  updated_at?: string | null
  ship_date?: string | null

  // Nested product list
  products?: ShiptheoryProduct[] | null

  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
      return 'PENDING'
    case 'label created':
    case 'label_created':
      return 'LABEL_CREATED'
    case 'in transit':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'out for delivery':
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'exception':
    case 'failed':
    case 'error':
      return 'EXCEPTION'
    case 'returned':
    case 'return to sender':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: ShiptheoryShipment): Shipment {
  return {
    id: raw.channel_reference_id ?? undefined,
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service_name ?? undefined,
    originAddress: raw.sender ? transformAddress(raw.sender) : undefined,
    destinationAddress: raw.recipient ? transformAddress(raw.recipient) : undefined,
    totalWeight: toWeight(raw.weight, 'kg'),
    cost: parseDecimal(raw.value) !== undefined
      ? {
          amount: parseDecimal(raw.value) ?? 0,
          currency: 'GBP',
        }
      : undefined,
    reference: raw.channel_reference_id ?? undefined,
    notes: raw.channel_reference_id_3 ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
