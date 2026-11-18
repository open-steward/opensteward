import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── nShift raw types ────────────────────────────────────────────────────────

export interface NShiftParty {
  name?: string | null
  address1?: string | null
  address2?: string | null
  zipcode?: string | null
  city?: string | null
  country?: string | null
  contact?: string | null
  phone?: string | null
  mobile?: string | null
  email?: string | null
  [key: string]: unknown
}

export interface NShiftParcel {
  parcelNo?: string | null
  weight?: number | null
  packageCode?: string | null
  copies?: number | null
  contents?: string | null
  [key: string]: unknown
}

export interface NShiftPdf {
  href?: string | null
  description?: string | null
  [key: string]: unknown
}

export interface NShiftShipment {
  id?: string | null
  status?: string | null
  orderNo?: string | null
  senderReference?: string | null
  receiverReference?: string | null
  shipDate?: string | null
  created?: string | null
  updated?: string | null
  service?: { id?: string | null } | null
  sender?: NShiftParty | null
  receiver?: NShiftParty | null
  parcels?: NShiftParcel[] | null
  pdfs?: NShiftPdf[] | null
  parcelCount?: number | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const v = status.toUpperCase()
  if (v === 'READY' || v === 'STORED' || v === 'NEW') return 'PENDING'
  if (v === 'PRINTED' || v === 'LABEL_CREATED' || v === 'BOOKED') return 'LABEL_CREATED'
  if (v === 'DELIVERING' || v === 'IN_TRANSIT' || v.includes('TRANSIT')) return 'IN_TRANSIT'
  if (v === 'OUT_FOR_DELIVERY' || v.includes('OUT_FOR_DELIVERY')) return 'OUT_FOR_DELIVERY'
  if (v === 'DELIVERED' || v === 'DELIVERED_OK') return 'DELIVERED'
  if (v === 'EXCEPTION' || v.includes('ERROR') || v.includes('FAIL')) return 'EXCEPTION'
  if (v === 'RETURNED' || v.includes('RETURN')) return 'RETURNED'
  if (v === 'CANCELLED' || v === 'CANCELED' || v === 'DELETED') return 'CANCELLED'
  return 'UNKNOWN'
}

// ─── Address adapter ─────────────────────────────────────────────────────────

function partyToRaw(party: NShiftParty | null | undefined): Record<string, unknown> | null {
  if (!party) return null
  return {
    name: party.name,
    address1: party.address1,
    address2: party.address2,
    postal_code: party.zipcode,
    city: party.city,
    country: party.country,
    phone: party.phone ?? party.mobile,
    email: party.email,
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformShipment(raw: NShiftShipment): Shipment {
  // Sum parcel weights if present
  const firstParcelWeight =
    raw.parcels && raw.parcels.length > 0 ? raw.parcels[0]?.weight ?? null : null
  const totalWeightKg =
    raw.parcels?.reduce((acc, p) => acc + (p.weight ?? 0), 0) ?? firstParcelWeight

  // Label URL: first PDF href
  const labelUrl = raw.pdfs && raw.pdfs.length > 0 ? raw.pdfs[0]?.href ?? undefined : undefined

  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.parcels?.[0]?.parcelNo ?? undefined,
    carrierId: 'nshift',
    serviceCode: raw.service?.id ?? undefined,
    originAddress: toAddress(partyToRaw(raw.sender)),
    destinationAddress: toAddress(partyToRaw(raw.receiver)),
    totalWeight: totalWeightKg != null ? toWeight(totalWeightKg, 'kg') : undefined,
    labelUrl: labelUrl,
    reference: raw.senderReference ?? raw.orderNo ?? undefined,
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    metadata: raw as Record<string, unknown>,
  }
}
