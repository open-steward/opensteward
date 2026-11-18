import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate, toWeight, toDimensions } from '../../shared/transform'

export interface DPDParcel {
  parcelNumber: string | null
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  [key: string]: unknown
}

export interface DPDAddress {
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

export interface DPDCollectionDetails {
  address: DPDAddress | null
  [key: string]: unknown
}

export interface DPDDeliveryDetails {
  address: DPDAddress | null
  [key: string]: unknown
}

export interface DPDShipmentResponse {
  shipmentId: string | null
  consignmentNumber: string | null
  collectionDate: string | null
  networkCode: string | null
  numberOfParcels: number | null
  totalWeight: number | null
  parcels: DPDParcel[] | null
  collectionDetails: DPDCollectionDetails | null
  deliveryDetails: DPDDeliveryDetails | null
  status: string | null
  manifestReference: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'ALLOCATED':     return 'LABEL_CREATED'
    case 'COLLECTED':     return 'IN_TRANSIT'
    case 'IN_TRANSIT':    return 'IN_TRANSIT'
    case 'AT_DEPOT':      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY': return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':     return 'DELIVERED'
    case 'FAILED':        return 'EXCEPTION'
    case 'RETURNED':      return 'RETURNED'
    case 'CANCELLED':     return 'CANCELLED'
    default:              return 'UNKNOWN'
  }
}

function dpdAddressToCanonical(addr: DPDAddress | null | undefined) {
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

export function transformShipment(raw: DPDShipmentResponse): Shipment {
  const firstParcel = (raw.parcels ?? [])[0]

  return {
    id: raw.shipmentId ?? raw.consignmentNumber ?? '',
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.consignmentNumber ?? undefined,
    carrierId: 'dpd',
    serviceCode: raw.networkCode ?? undefined,
    originAddress: dpdAddressToCanonical(raw.collectionDetails?.address),
    destinationAddress: dpdAddressToCanonical(raw.deliveryDetails?.address),
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
