import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate, toWeight, parseDecimal } from '../../shared/transform'

/**
 * eShipz shipment record (v1 create-shipments response body under `data`).
 */
export interface EshipzShipment {
  order_id: string | number | null
  slug: string | null
  service_type: string | null
  status: string | null
  /** AWB / tracking number */
  awb: string | null
  charged_weight?: { value?: number | null; unit?: string | null } | null
  shipment?: {
    ship_from?: EshipzAddress | null
    ship_to?: EshipzAddress | null
  } | null
  files?: {
    label?: {
      label_meta?: {
        url?: string | null
        awb?: string | null
      } | null
    } | null
  } | null
  expected_delivery_date?: string | null
  delivered_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface EshipzAddress {
  contact_name?: string | null
  company_name?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('booked') || s.includes('created') || s.includes('label')) return 'LABEL_CREATED'
  if (s.includes('pickup') || s.includes('picked')) return 'IN_TRANSIT'
  if (s.includes('intransit') || s.includes('in_transit') || s.includes('transit')) return 'IN_TRANSIT'
  if (s.includes('out_for_delivery') || s.includes('out for delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('delivered')) return 'DELIVERED'
  if (s.includes('rto') || s.includes('return')) return 'RETURNED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('exception') || s.includes('lost') || s.includes('ndr')) return 'EXCEPTION'
  return 'UNKNOWN'
}

function rawAddressToRecord(addr: EshipzAddress | null | undefined): Record<string, unknown> | null {
  if (!addr) return null
  return {
    full_name: addr.contact_name,
    company: addr.company_name,
    street1: addr.street1,
    street2: addr.street2,
    city: addr.city,
    state: addr.state,
    postalCode: addr.postal_code,
    country: addr.country,
    phone: addr.phone,
    email: addr.email,
  }
}

export function transformShipment(raw: EshipzShipment): Shipment {
  const awb = raw.files?.label?.label_meta?.awb ?? raw.awb ?? undefined
  const labelUrl = raw.files?.label?.label_meta?.url ?? undefined
  const weightVal = raw.charged_weight?.value ?? undefined
  const weightUnit = (raw.charged_weight?.unit?.toLowerCase() ?? 'kg') as 'kg' | 'g' | 'lb' | 'oz'

  return {
    id: raw.order_id != null ? String(raw.order_id) : undefined,
    status: mapShipmentStatus(raw.status ?? null),
    trackingNumber: awb ?? undefined,
    carrierId: raw.slug ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    originAddress: toAddress(rawAddressToRecord(raw.shipment?.ship_from ?? null) ?? undefined),
    destinationAddress: toAddress(rawAddressToRecord(raw.shipment?.ship_to ?? null) ?? undefined),
    totalWeight: toWeight(weightVal, weightUnit),
    labelUrl: labelUrl ?? undefined,
    estimatedDeliveryAt: toISODate(raw.expected_delivery_date),
    actualDeliveryAt: toISODate(raw.delivered_date),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Build a minimal eShipz create-shipment request body from a canonical Shipment.
 */
export function shipmentToCreateBody(data: Partial<Shipment>): Record<string, unknown> {
  const origin = data.originAddress
  const dest = data.destinationAddress
  const pkg = data.packages?.[0]
  const weightKg = parseDecimal(data.totalWeight?.value) ?? parseDecimal(pkg?.weight?.value) ?? 0.5

  return {
    billing: { paid_by: 'shipper' },
    is_document: false,
    is_cod: false,
    collect_on_delivery: { amount: 0, currency: 'INR' },
    customer_reference: data.reference ?? undefined,
    notes: data.notes ?? undefined,
    shipment: {
      is_reverse: false,
      is_to_pay: false,
      ship_from: origin
        ? {
            contact_name: origin.name ?? '',
            company_name: origin.company ?? '',
            street1: origin.street1 ?? '',
            street2: origin.street2 ?? '',
            city: origin.city ?? '',
            state: origin.state ?? '',
            postal_code: origin.postalCode ?? '',
            country: origin.country ?? '',
            phone: origin.phone ?? '',
            email: origin.email ?? '',
          }
        : undefined,
      ship_to: dest
        ? {
            contact_name: dest.name ?? '',
            company_name: dest.company ?? '',
            street1: dest.street1 ?? '',
            street2: dest.street2 ?? '',
            city: dest.city ?? '',
            state: dest.state ?? '',
            postal_code: dest.postalCode ?? '',
            country: dest.country ?? '',
            phone: dest.phone ?? '',
            email: dest.email ?? '',
          }
        : undefined,
      parcels: [
        {
          description: data.notes ?? 'Parcel',
          weight: { value: weightKg, unit: 'kg' },
          dimension: pkg?.dimensions
            ? {
                length: pkg.dimensions.length,
                width: pkg.dimensions.width,
                height: pkg.dimensions.height,
                unit: pkg.dimensions.unit,
              }
            : { length: 10, width: 10, height: 10, unit: 'cm' },
        },
      ],
    },
    charged_weight: { value: weightKg, unit: 'KG' },
  }
}
