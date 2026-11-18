import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toDimensions, toISODate } from '../../shared/transform'

// ─── DPD-DE raw types ─────────────────────────────────────────────────────

export interface DpdDeParcel {
  parcelNumber: string | null
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  [key: string]: unknown
}

export interface DpdDeAddress {
  organisation: string | null
  countryCode: string | null
  postcode: string | null
  town: string | null
  county: string | null
  street: string | null
  locality: string | null
  contactName: string | null
  contactTelephone: string | null
  contactEmail: string | null
  [key: string]: unknown
}

export interface DpdDeCollectionDetails {
  address: DpdDeAddress | null
  [key: string]: unknown
}

export interface DpdDeDeliveryDetails {
  address: DpdDeAddress | null
  [key: string]: unknown
}

export interface DpdDeLabel {
  data: string
  format: string
  [key: string]: unknown
}

export interface DpdDeShipmentResponse {
  shipmentId: string | null
  consignmentNumber: string | null
  collectionDate: string | null
  networkCode: string | null
  numberOfParcels: number | null
  totalWeight: number | null
  parcels: DpdDeParcel[] | null
  collectionDetails: DpdDeCollectionDetails | null
  deliveryDetails: DpdDeDeliveryDetails | null
  status: string | null
  manifestReference: string | null
  labels: DpdDeLabel[] | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'ALLOCATED':          return 'LABEL_CREATED'
    case 'PICKUP':             return 'IN_TRANSIT'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':   return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'NOT_DELIVERED':      return 'EXCEPTION'
    case 'RETURNED':           return 'RETURNED'
    case 'CANCELLED':          return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

function dpdDeAddressToCanonical(addr: DpdDeAddress | null | undefined) {
  if (!addr) return undefined
  return toAddress({
    name: addr.contactName,
    company: addr.organisation,
    street1: addr.street,
    street2: addr.locality,
    city: addr.town,
    state: addr.county,
    postalCode: addr.postcode,
    country: addr.countryCode,
    phone: addr.contactTelephone,
    email: addr.contactEmail,
  })
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: DpdDeShipmentResponse): Shipment {
  const firstParcel = (raw.parcels ?? [])[0]

  return {
    id: raw.shipmentId ?? raw.consignmentNumber ?? '',
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.consignmentNumber ?? undefined,
    carrierId: 'dpd-de',
    serviceCode: raw.networkCode ?? undefined,
    originAddress: dpdDeAddressToCanonical(raw.collectionDetails?.address),
    destinationAddress: dpdDeAddressToCanonical(raw.deliveryDetails?.address),
    totalWeight: toWeight(raw.totalWeight, 'kg'),
    dimensions: firstParcel
      ? toDimensions(firstParcel.length, firstParcel.width, firstParcel.height, 'cm')
      : undefined,
    packages: (raw.parcels ?? []).map((p) => ({
      trackingNumber: p.parcelNumber ?? undefined,
      weight: toWeight(p.weight, 'kg'),
      dimensions: toDimensions(p.length, p.width, p.height, 'cm'),
    })),
    reference: raw.manifestReference ?? undefined,
    createdAt: toISODate(raw.collectionDate),
    metadata: raw as Record<string, unknown>,
  }
}
