/**
 * Terminal Africa v1 shipment object -> canonical Shipment.
 *
 * Reads only the documented fields:
 * - https://docs.terminal.africa/tship/shipment/get-shipments.md and
 *   .../shipment/get-shipment.md (the v1 shipment object: shipment_id, status,
 *   address_from / address_to / address_return, parcel, events, created_at,
 *   updated_at);
 * - https://docs.terminal.africa/tship/miscallaneous/shipment-extras.md
 *   (`extras.tracking_number`, `extras.shipping_label_url`);
 * - https://docs.terminal.africa/tship/insurance/get-insurance.md, whose
 *   embedded shipment shows `carrier` as a carrier id ("CA-81957188177") and
 *   `delivery_date`.
 *
 * address_from, address_to, address_return, carrier and parcel are ids unless
 * the list was asked to populate them ("Indicate if full details should be
 * provided for select fields including address_from, address_return,
 * address_to, carrier, parcel"), so each is read only in the shape it arrived.
 *
 * No cost: the v1 shipment object documents no cost or currency.
 */
import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Weight } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { transformAddress, type TerminalAfricaAddress } from './address'

export interface TerminalAfricaParcelItem {
  description?: string | null
  name?: string | null
  currency?: string | null
  value?: string | number | null
  weight?: number | null
  quantity?: number | null
}

export interface TerminalAfricaParcel {
  id?: string | null
  parcel_id?: string | null
  packaging?: string | null
  total_weight?: number | null
  weight?: number | null
  weight_unit?: string | null
  items?: TerminalAfricaParcelItem[]
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface TerminalAfricaShipmentExtras {
  tracking_number?: string | null
  tracking_url?: string | null
  carrier_tracking_url?: string | null
  commercial_invoice_url?: string | null
  shipping_label_url?: string | null
  reference?: string | null
  /** Not a documented extras key; still read by getLabel / createLabel. */
  label_url?: string | null
  [key: string]: unknown
}

/** https://docs.terminal.africa/tship/miscallaneous/shipment-event.md */
export interface TerminalAfricaShipmentEvent {
  created_at?: string | null
  description?: string | null
  location?: string | null
  status?: string | null
  [key: string]: unknown
}

export interface TerminalAfricaShipment {
  id?: string | null
  shipment_id?: string | null
  address_from?: TerminalAfricaAddress | string | null
  address_to?: TerminalAfricaAddress | string | null
  address_return?: TerminalAfricaAddress | string | null
  parcel?: TerminalAfricaParcel | string | null
  carrier?: string | null
  /** Not documented on the v1 shipment object; still read by transformLabel. */
  carrier_slug?: string | null
  /** Documented on the tracking response only; still read by transformLabel. */
  carrier_tracking_number?: string | null
  /** Not documented on the v1 shipment object; still read by transformLabel. */
  tracking_number?: string | null
  rate?: string | null
  status?: string | null
  shipment_purpose?: string | null
  delivery_date?: string | null
  delivery_arranged?: string | null
  pickup_date?: string | null
  extras?: TerminalAfricaShipmentExtras | null
  events?: TerminalAfricaShipmentEvent[]
  metadata?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/**
 * The documented statuses: "Must be one of cancelled, confirmed, delivered,
 * draft, in-transit, pending" (get-shipments.md, `status` query parameter).
 */
function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'draft':
    case 'pending':
      return 'PENDING'
    case 'confirmed':
      return 'LABEL_CREATED'
    case 'in-transit':
      return 'IN_TRANSIT'
    case 'delivered':
      return 'DELIVERED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function address(raw: TerminalAfricaAddress | string | null | undefined) {
  return raw && typeof raw === 'object' ? transformAddress(raw) : undefined
}

/** Parcel weight unit: "Only kg is allowed at this time" (parcel/create-parcel.md). */
function parcelWeight(
  parcel: TerminalAfricaParcel | string | null | undefined,
): Weight | undefined {
  if (!parcel || typeof parcel !== 'object') return undefined
  if (typeof parcel.total_weight !== 'number' || parcel.weight_unit !== 'kg') return undefined
  return { value: parcel.total_weight, unit: 'kg' }
}

function absoluteUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined
  try {
    const { protocol } = new URL(value)
    return protocol === 'https:' || protocol === 'http:' ? value : undefined
  } catch {
    return undefined
  }
}

export function transformShipment(raw: TerminalAfricaShipment): Shipment {
  return {
    id: raw.shipment_id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.extras?.tracking_number || undefined,
    carrierId: typeof raw.carrier === 'string' && raw.carrier ? raw.carrier : undefined,
    originAddress: address(raw.address_from),
    destinationAddress: address(raw.address_to),
    returnAddress: address(raw.address_return),
    totalWeight: parcelWeight(raw.parcel),
    estimatedDeliveryAt: toISODate(raw.delivery_date),
    labelUrl: absoluteUrl(raw.extras?.shipping_label_url),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
