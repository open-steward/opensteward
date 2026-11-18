import type { Shipment, ShipmentStatus, ShipmentMode } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

export interface CargoOneAddress {
  name?: string | null
  company?: string | null
  street?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country_code?: string | null
  phone?: string | null
  email?: string | null
}

export interface CargoOneShipment {
  id: string
  status?: string | null
  reference?: string | null
  tracking_number?: string | null
  carrier_id?: string | null
  carrier_name?: string | null
  service_code?: string | null
  mode?: string | null
  origin?: CargoOneAddress | null
  destination?: CargoOneAddress | null
  weight?: number | null
  weight_unit?: string | null
  chargeable_weight?: number | null
  label_url?: string | null
  total_amount?: number | null
  currency?: string | null
  notes?: string | null
  estimated_delivery_at?: string | null
  actual_delivery_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(raw: string | null | undefined): ShipmentStatus {
  if (!raw) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[raw.toLowerCase()] as ShipmentStatus | undefined) ?? 'UNKNOWN'
}

function mapMode(raw: string | null | undefined): ShipmentMode | undefined {
  if (!raw) return undefined
  const m = raw.toLowerCase()
  if (m === 'air') return 'air'
  if (m === 'ocean' || m === 'sea') return 'ocean'
  if (m === 'parcel') return 'parcel'
  if (m === 'ltl') return 'ltl'
  if (m === 'ftl') return 'ftl'
  if (m === 'rail') return 'rail'
  return 'unknown'
}

function mapAddress(addr: CargoOneAddress | null | undefined): Shipment['originAddress'] {
  if (!addr) return undefined
  return {
    name: addr.name ?? undefined,
    company: addr.company ?? undefined,
    street1: addr.street ?? undefined,
    street2: addr.street2 ?? undefined,
    city: addr.city ?? undefined,
    state: addr.state ?? undefined,
    postalCode: addr.postal_code ?? undefined,
    country: addr.country_code ?? undefined,
    phone: addr.phone ?? undefined,
    email: addr.email ?? undefined,
  }
}

export function transformShipment(raw: CargoOneShipment): Shipment {
  const weightUnit = (raw.weight_unit ?? 'kg').toLowerCase()
  const unit = (weightUnit === 'lb' || weightUnit === 'oz' || weightUnit === 'g' || weightUnit === 'kg')
    ? (weightUnit as 'oz' | 'lb' | 'g' | 'kg')
    : 'kg'

  return {
    id: raw.id,
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier_id ?? raw.carrier_name ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    mode: mapMode(raw.mode),
    originAddress: mapAddress(raw.origin),
    destinationAddress: mapAddress(raw.destination),
    totalWeight: toWeight(raw.chargeable_weight ?? raw.weight, unit),
    labelUrl: raw.label_url ?? undefined,
    cost:
      raw.total_amount != null && raw.currency
        ? {
            amount: parseDecimal(raw.total_amount) ?? 0,
            currency: raw.currency,
          }
        : undefined,
    reference: raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    actualDeliveryAt: toISODate(raw.actual_delivery_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
