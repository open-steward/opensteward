import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toDimensions, toISODate } from '../../shared/transform'

// ─── DPD-UK raw types ─────────────────────────────────────────────────────

export interface DpdUkParcel {
  parcelNumber: string | null
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  [key: string]: unknown
}

export interface DpdUkAddress {
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

export interface DpdUkCollectionDetails {
  address: DpdUkAddress | null
  [key: string]: unknown
}

export interface DpdUkDeliveryDetails {
  address: DpdUkAddress | null
  [key: string]: unknown
}

export interface DpdUkLabel {
  data: string
  format: string
  [key: string]: unknown
}

export interface DpdUkShipmentResponse {
  shipmentId: string | null
  consignmentNumber: string | null
  collectionDate: string | null
  networkCode: string | null
  numberOfParcels: number | null
  totalWeight: number | null
  parcels: DpdUkParcel[] | null
  collectionDetails: DpdUkCollectionDetails | null
  deliveryDetails: DpdUkDeliveryDetails | null
  status: string | null
  manifestReference: string | null
  labels: DpdUkLabel[] | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'ALLOCATED':          return 'LABEL_CREATED'
    case 'COLLECTED':          return 'IN_TRANSIT'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'WITH_DRIVER':        return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'CARDED':             return 'EXCEPTION'
    case 'RETURNED':           return 'RETURNED'
    case 'CANCELLED':          return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

function dpdUkAddressToCanonical(addr: DpdUkAddress | null | undefined) {
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

export function transformShipment(raw: DpdUkShipmentResponse): Shipment {
  const firstParcel = (raw.parcels ?? [])[0]

  return {
    id: raw.shipmentId ?? raw.consignmentNumber ?? '',
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.consignmentNumber ?? undefined,
    carrierId: 'dpd-uk',
    serviceCode: raw.networkCode ?? undefined,
    originAddress: dpdUkAddressToCanonical(raw.collectionDetails?.address),
    destinationAddress: dpdUkAddressToCanonical(raw.deliveryDetails?.address),
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
