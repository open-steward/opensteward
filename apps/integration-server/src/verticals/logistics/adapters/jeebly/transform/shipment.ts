import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import type { Address } from '../../../schema/shared'

export interface JeeblyAddress {
  name?: string | null
  company?: string | null
  address_line1?: string | null
  address_line2?: string | null
  city?: string | null
  area?: string | null
  state?: string | null
  country?: string | null
  postal_code?: string | null
  phone?: string | null
  email?: string | null
}

export interface JeeblyShipment {
  id: string
  awb?: string | null
  reference?: string | null
  status: string
  service_type?: string | null
  consignee?: JeeblyAddress | null
  shipper?: JeeblyAddress | null
  weight?: number | null
  weight_unit?: string | null
  cod_amount?: number | null
  currency?: string | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapJeeblyShipmentStatus(status: string): ShipmentStatus {
  const s = status.toLowerCase()
  if (s.includes('delivered'))                    return 'DELIVERED'
  if (s.includes('out_for_delivery') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('in_transit') || s.includes('in transit') || s.includes('shipped')) return 'IN_TRANSIT'
  if (s.includes('label') || s.includes('booked') || s.includes('created') || s.includes('pending')) return 'LABEL_CREATED'
  if (s.includes('returned') || s.includes('return')) return 'RETURNED'
  if (s.includes('cancelled') || s.includes('canceled')) return 'CANCELLED'
  if (s.includes('exception') || s.includes('failed')) return 'EXCEPTION'
  return 'UNKNOWN'
}

function transformJeeblyAddress(raw: JeeblyAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  return {
    name: raw.name ?? undefined,
    company: raw.company ?? undefined,
    street1: raw.address_line1 ?? undefined,
    street2: raw.address_line2 ?? undefined,
    city: raw.city ?? raw.area ?? undefined,
    state: raw.state ?? undefined,
    postalCode: raw.postal_code ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
}

export function transformJeeblyShipment(raw: JeeblyShipment): Shipment {
  const weightUnit = (raw.weight_unit ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  const validUnits = ['oz', 'lb', 'g', 'kg']
  const unit = validUnits.includes(weightUnit) ? weightUnit : 'kg'

  return {
    id: raw.id,
    status: mapJeeblyShipmentStatus(raw.status),
    trackingNumber: raw.awb ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    originAddress: transformJeeblyAddress(raw.shipper),
    destinationAddress: transformJeeblyAddress(raw.consignee),
    totalWeight: toWeight(raw.weight, unit as 'oz' | 'lb' | 'g' | 'kg'),
    cost:
      raw.cod_amount != null
        ? {
            amount: parseDecimal(raw.cod_amount) ?? 0,
            currency: (raw.currency ?? 'AED') as string,
          }
        : undefined,
    reference: raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
