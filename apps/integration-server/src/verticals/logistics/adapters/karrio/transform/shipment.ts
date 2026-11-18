import { majorToMinor } from '@opensteward/shared'
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Weight } from '../../../schema/shared'
import { toISODate, toDimensions } from '../../shared/transform'
import { transformAddress, type KarrioAddress } from './address'

/**
 * Karrio `Parcel` (https://docs.karrio.io/reference/openapi, schema Parcel):
 * weight "The parcel's weight", weight_unit enum KG | LB | OZ | G,
 * width/height/length, dimension_unit enum CM | IN | null.
 */
export interface KarrioParcel {
  id?: string
  weight?: number | null
  weight_unit?: string | null
  width?: number | null
  height?: number | null
  length?: number | null
  dimension_unit?: string | null
  packaging_type?: string | null
  [key: string]: unknown
}

/**
 * Karrio `Rate`: carrier_id "The targeted carrier's name (unique identifier)",
 * currency "The rate monetary values currency code", total_charge "The rate's
 * monetary amount of the total charge" (a major-unit double).
 */
export interface KarrioRate {
  id?: string
  carrier_id?: string | null
  carrier_name?: string | null
  service?: string | null
  total_charge?: number | null
  currency?: string | null
  transit_days?: number | null
  estimated_delivery?: string | null
  [key: string]: unknown
}

/** Karrio `Shipment` (schema Shipment). It documents no updated_at. */
export interface KarrioShipment {
  id: string
  status?: string | null
  tracking_number?: string | null
  carrier_id?: string | null
  carrier_name?: string | null
  service?: string | null
  shipper?: KarrioAddress | null
  recipient?: KarrioAddress | null
  return_address?: KarrioAddress | null
  parcels?: KarrioParcel[]
  selected_rate?: KarrioRate | null
  label_url?: string | null
  invoice_url?: string | null
  meta?: Record<string, unknown>
  reference?: string | null
  label_type?: string | null
  created_at?: string | null
  [key: string]: unknown
}

/**
 * The documented Shipment.status enum. 2024.12.6: draft, purchased, cancelled,
 * shipped, in_transit, delivered, needs_attention, out_for_delivery,
 * delivery_failed. 2026.1.32 names `created` where 2024.12.6 has `purchased`.
 */
function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'draft':
      return 'PENDING'
    case 'purchased':
    case 'created':
      return 'LABEL_CREATED'
    case 'shipped':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'needs_attention':
    case 'delivery_failed':
      return 'EXCEPTION'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

const WEIGHT_UNITS: Record<string, Weight['unit']> = { KG: 'kg', LB: 'lb', OZ: 'oz', G: 'g' }
const DIMENSION_UNITS: Record<string, 'cm' | 'in'> = { CM: 'cm', IN: 'in' }

/** Sum of the parcel weights, only when every parcel states one in the same documented unit. */
function totalWeight(parcels: KarrioParcel[]): Weight | undefined {
  if (parcels.length === 0) return undefined
  const unit = WEIGHT_UNITS[parcels[0]!.weight_unit ?? '']
  if (!unit) return undefined
  let value = 0
  for (const p of parcels) {
    if (WEIGHT_UNITS[p.weight_unit ?? ''] !== unit) return undefined
    if (typeof p.weight !== 'number' || !Number.isFinite(p.weight)) return undefined
    value += p.weight
  }
  return { value, unit }
}

/** An absolute URL only: the canonical labelUrl must be one. */
function absoluteUrl(url: string | null | undefined): string | undefined {
  return url && URL.canParse(url) ? url : undefined
}

export function transformShipment(raw: KarrioShipment): Shipment {
  const parcels = raw.parcels ?? []
  // Overall dimensions are one parcel's; several parcels have no single box.
  const only = parcels.length === 1 ? parcels[0]! : undefined
  const dimUnit = only ? DIMENSION_UNITS[only.dimension_unit ?? ''] : undefined
  const rate = raw.selected_rate ?? null
  const currency = rate?.currency || undefined
  const amount =
    currency && typeof rate?.total_charge === 'number'
      ? majorToMinor(rate.total_charge, currency)
      : undefined

  return {
    id: raw.id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier_id ?? undefined,
    serviceCode: raw.service ?? undefined,
    originAddress: raw.shipper ? transformAddress(raw.shipper) : undefined,
    destinationAddress: raw.recipient ? transformAddress(raw.recipient) : undefined,
    returnAddress: raw.return_address ? transformAddress(raw.return_address) : undefined,
    totalWeight: totalWeight(parcels),
    dimensions:
      only && dimUnit ? toDimensions(only.length, only.width, only.height, dimUnit) : undefined,
    labelUrl: absoluteUrl(raw.label_url),
    cost: currency && amount !== undefined ? { amount, currency } : undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
