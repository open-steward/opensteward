import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ── Raw parcelLab tracking (shipment-level view) ──────────────────────────────

export interface ParcellabShipment {
  /** parcelLab internal UUID */
  external_id?: string | null
  /** Carrier tracking number */
  tracking_number?: string | null
  /** Carrier/courier identifier (e.g. "dhl", "ups") */
  courier?: string | null
  /** Courier service level */
  courier_service_level?: string | null
  /** Delivery method */
  delivery_method?: string | null
  /** Recipient postal code */
  zip_code?: string | null
  /** Destination city */
  city?: string | null
  /** Destination country ISO 3166-1 alpha-3 */
  destination_country_iso3?: string | null
  /** Current lifecycle status */
  last_delivery_status?: {
    status_code?: string | null
    status_text?: string | null
  } | null
  /** Announced delivery date */
  announced_delivery_date?: string | null
  /** Shipping weight value */
  shipping_weight_total?: number | null
  /** Shipping weight unit */
  shipping_weight_unit?: 'g' | 'kg' | 'lbs' | 'oz' | null
  /** Shipping dimensions */
  shipping_dimensions?: {
    height?: number | null
    width?: number | null
    length?: number | null
    unit?: string | null
  } | null
  /** Return shipment flag */
  is_return?: boolean | null
  /** URL to the shipping label */
  label_url?: string | null
  /** Order number reference */
  orderNo?: string | null
  /** ISO-8601 creation timestamp */
  created_at?: string | null
  /** ISO-8601 last-modified timestamp */
  updated_at?: string | null
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s === 'pending') return 'PENDING'
  if (s === 'transit' || s === 'customs') return 'IN_TRANSIT'
  if (s === 'lastmile') return 'OUT_FOR_DELIVERY'
  if (s === 'readytocollect') return 'OUT_FOR_DELIVERY'
  if (s === 'delivered') return 'DELIVERED'
  if (s === 'sentback' || s === 'returned') return 'RETURNED'
  if (s === 'failed' || s === 'cancelled') return 'CANCELLED'
  return 'UNKNOWN'
}

// ── Weight unit normalisation ─────────────────────────────────────────────────

function toWeightUnit(unit: string | null | undefined): 'oz' | 'lb' | 'g' | 'kg' {
  switch ((unit ?? '').toLowerCase()) {
    case 'g': return 'g'
    case 'kg': return 'kg'
    case 'lbs': return 'lb'
    case 'oz': return 'oz'
    default: return 'g'
  }
}

// ── Dimension unit normalisation ──────────────────────────────────────────────

function toDimUnit(unit: string | null | undefined): 'in' | 'cm' {
  if ((unit ?? '').toLowerCase() === 'in') return 'in'
  return 'cm'
}

// ── Shipment transform ────────────────────────────────────────────────────────

export function transformShipment(raw: ParcellabShipment): Shipment {
  const weight =
    raw.shipping_weight_total != null
      ? { value: raw.shipping_weight_total, unit: toWeightUnit(raw.shipping_weight_unit) }
      : undefined

  const dim = raw.shipping_dimensions
  const dimensions =
    dim && dim.length != null && dim.width != null && dim.height != null
      ? {
          length: dim.length,
          width: dim.width,
          height: dim.height,
          unit: toDimUnit(dim.unit),
        }
      : undefined

  const destinationAddress =
    raw.zip_code || raw.city || raw.destination_country_iso3
      ? {
          city: raw.city ?? undefined,
          postalCode: raw.zip_code ?? undefined,
          country: raw.destination_country_iso3 ?? undefined,
        }
      : undefined

  return {
    id: raw.external_id ?? undefined,
    status: mapShipmentStatus(raw.last_delivery_status?.status_code),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.courier ?? undefined,
    serviceCode: raw.courier_service_level ?? undefined,
    destinationAddress,
    totalWeight: weight,
    dimensions,
    estimatedDeliveryAt: toISODate(raw.announced_delivery_date),
    labelUrl: raw.label_url ?? undefined,
    reference: raw.orderNo ?? undefined,
    mode: 'parcel',
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
