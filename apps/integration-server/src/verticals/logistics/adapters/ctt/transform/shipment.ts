import type { Shipment } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ─── CTT raw types ─────────────────────────────────────────────────────────
//
// GET /shipments/newsince/:startNumber/:iso3339Date, "JSON reply data"
// (https://api.pakketmail.nl/v3/apidocs/usa/endpoints/shipments/newsince/GET,
// and the same response schema in CTT's https://enviosecommerceapi.ctt.pt/v3/openapi/).

/** The `Address` schema of CTT's OpenAPI document ("Address information"). */
export interface CttAddress {
  Name?: string
  CompanyName?: string
  AddressExtend?: string
  Streetname1?: string
  Streetname2?: string
  HouseNumber?: number
  NumberExtension?: string
  Neighborhood?: string
  PostalCode?: string
  City?: string
  State?: string
  /** "Country, iso3 format". */
  Country?: string
  Email?: string
  Phone?: string
}

export interface CttShipmentItem {
  ArticleNumber?: string
  Description?: string
  Quantity?: number
  /** "The weight of the item in gramms". */
  Weight?: number
  /** "The price, no currency code is added". */
  Price?: number
  HSCode?: string
  Dimensions?: string
}

export interface CttShipment {
  /** "The internal shipment id". */
  ShipmentId: number
  /** "The client reference code for the order/shipment". */
  ClientReference?: string
  /** "The id of the carrier" — the `Id` of GET /carriers/. */
  CarrierId?: number
  /** "The correct service id for the carrier". */
  ServiceId?: number
  OptionId?: number
  Colli?: number
  /** "RFC3339 datetime ... The date this shipment was received". */
  ImportDate?: string
  Note1?: string
  Note2?: string
  Recipient?: CttAddress
  ExtraServices?: Array<{ ServiceId: number; Value: string }>
  ShipmentItems?: CttShipmentItem[]
}

export interface CttShipmentListResponse {
  /** "If ShipmentCount is less than 25, it means this is the last possible shipment list". */
  ShipmentCount?: number
  Shipments?: CttShipment[]
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * The recipient address. `Country` is documented as ISO 3166 alpha-3 ("valid
 * ISO3 country name ... for example: NLD"); the canonical address takes
 * alpha-2, so it is left out here and kept in the shipment's metadata.
 */
function toAddress(r: CttAddress): Address {
  const street1 =
    [r.Streetname1, r.HouseNumber != null ? String(r.HouseNumber) : undefined, r.NumberExtension]
      .filter(Boolean)
      .join(' ') || undefined
  return {
    name: r.Name,
    company: r.CompanyName,
    street1,
    street2: r.Streetname2,
    city: r.City,
    state: r.State,
    postalCode: r.PostalCode,
    phone: r.Phone,
    email: r.Email,
  }
}

/**
 * A shipment from GET /shipments/newsince. The reply carries no status, no
 * tracking id and no cost, so none is set: a shipment in this list has only
 * been "imported in the system".
 */
export function transformShipment(raw: CttShipment): Shipment {
  const notes = [raw.Note1, raw.Note2].filter(Boolean).join(' | ') || undefined
  return {
    id: String(raw.ShipmentId),
    carrierId: raw.CarrierId != null ? String(raw.CarrierId) : undefined,
    serviceCode: raw.ServiceId != null ? String(raw.ServiceId) : undefined,
    destinationAddress: raw.Recipient ? toAddress(raw.Recipient) : undefined,
    reference: raw.ClientReference,
    notes,
    createdAt: toISODate(raw.ImportDate),
    metadata: raw as unknown as Record<string, unknown>,
  }
}
