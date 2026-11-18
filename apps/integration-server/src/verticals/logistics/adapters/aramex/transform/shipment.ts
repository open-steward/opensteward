import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toDimensions, toISODate } from '../../shared/transform'

// ─── Aramex raw types ───────────────────────────────────────────────────────

export interface AramexAddress {
  Line1: string | null
  Line2: string | null
  Line3: string | null
  City: string | null
  StateOrProvinceCode: string | null
  PostCode: string | null
  CountryCode: string | null
  [key: string]: unknown
}

export interface AramexContact {
  PersonName: string | null
  CompanyName: string | null
  PhoneNumber1: string | null
  EmailAddress: string | null
  [key: string]: unknown
}

export interface AramexParty {
  Reference1: string | null
  AccountNumber: string | null
  PartyAddress: AramexAddress | null
  Contact: AramexContact | null
  [key: string]: unknown
}

export interface AramexDimensions {
  Length: number | null
  Width: number | null
  Height: number | null
  Unit: string | null
  [key: string]: unknown
}

export interface AramexWeight {
  Value: number | null
  Unit: string | null
  [key: string]: unknown
}

export interface AramexShipmentDetails {
  Dimensions: AramexDimensions | null
  ActualWeight: AramexWeight | null
  ProductGroup: string | null
  ProductType: string | null
  NumberOfPieces: number | null
  DescriptionOfGoods: string | null
  [key: string]: unknown
}

export interface AramexShipment {
  ID: string
  HasErrors: boolean
  Reference1: string | null
  Reference2: string | null
  Shipper: AramexParty | null
  Consignee: AramexParty | null
  ShipmentDetails: AramexShipmentDetails | null
  ShipmentLabel: { LabelURL: string | null; LabelFileContents: string | null } | null
  ShipmentNumber: string | null
  Status: string | null
  CreatedDate: string | null
  [key: string]: unknown
}

export interface AramexCreateShipmentResponse {
  Shipments: AramexShipment[]
  HasErrors: boolean
  Notifications: unknown[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  switch (status.toUpperCase()) {
    case 'CREATED':
    case 'PENDING':                 return 'PENDING'
    case 'IN_TRANSIT':
    case 'INTRANSIT':               return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':        return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':               return 'DELIVERED'
    case 'RETURNED':                return 'RETURNED'
    case 'CANCELLED':               return 'CANCELLED'
    case 'EXCEPTION':
    case 'ON_HOLD':                 return 'EXCEPTION'
    default:                        return 'UNKNOWN'
  }
}

// ─── Address helpers ────────────────────────────────────────────────────────

function transformAramexPartyAddress(party: AramexParty | null): ReturnType<typeof toAddress> {
  if (!party) return undefined
  const contact = party.Contact
  const addr = party.PartyAddress
  return toAddress({
    name: contact?.PersonName,
    company: contact?.CompanyName,
    phone: contact?.PhoneNumber1,
    email: contact?.EmailAddress,
    street1: addr?.Line1,
    street2: addr?.Line2,
    city: addr?.City,
    state: addr?.StateOrProvinceCode,
    postal_code: addr?.PostCode,
    country: addr?.CountryCode,
  })
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: AramexShipment): Shipment {
  const details = raw.ShipmentDetails
  const weightUnit = (details?.ActualWeight?.Unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  const dimUnit = (details?.Dimensions?.Unit?.toLowerCase() === 'in' ? 'in' : 'cm') as 'in' | 'cm'

  return {
    id: raw.ID,
    status: mapShipmentStatus(raw.Status),
    trackingNumber: raw.ShipmentNumber ?? undefined,
    carrierId: 'aramex',
    serviceCode: details?.ProductType ?? undefined,
    originAddress: transformAramexPartyAddress(raw.Shipper),
    destinationAddress: transformAramexPartyAddress(raw.Consignee),
    totalWeight: details?.ActualWeight?.Value != null
      ? toWeight(details.ActualWeight.Value, weightUnit)
      : undefined,
    dimensions: details?.Dimensions?.Length != null && details?.Dimensions?.Width != null && details?.Dimensions?.Height != null
      ? toDimensions(details.Dimensions.Length, details.Dimensions.Width, details.Dimensions.Height, dimUnit)
      : undefined,
    labelUrl: raw.ShipmentLabel?.LabelURL ?? undefined,
    reference: raw.Reference1 ?? undefined,
    notes: details?.DescriptionOfGoods ?? undefined,
    createdAt: toISODate(raw.CreatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
