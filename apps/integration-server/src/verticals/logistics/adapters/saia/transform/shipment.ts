import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

// ─── Saia raw types ────────────────────────────────────────────────────────
// Source: SAIA BOL REST API (api.saia.com/bol-docs/) and legacy SOAP BOL
// service (saiasecure.com/webservice/bol/Create.asp).
// A BOL (Bill of Lading) is the canonical LTL shipment record.

export interface SaiaBolAddress {
  AccountNumber?: string | null
  ContactName?: string | null
  Address1?: string | null
  Address2?: string | null
  City?: string | null
  State?: string | null
  Zipcode?: string | null
  [key: string]: unknown
}

export interface SaiaBolShipment {
  // Core identifiers
  ProNumber?: string | null
  BLNumber?: string | null
  QuoteNumber?: string | null
  ShipperNumber?: string | null
  // Status
  status?: string | null
  // Addresses
  Shipper?: SaiaBolAddress | null
  Consignee?: SaiaBolAddress | null
  // Dates
  ShipmentDate?: string | null
  created_at?: string | null
  // Label / document
  PDF?: string | null
  // Financials
  BillingTerms?: string | null
  // Service
  ServiceLevel?: string | null
  GuaranteedDelivery?: boolean | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapBolStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PENDING':
    case 'CREATED':
      return 'PENDING'
    case 'LABEL_CREATED':
    case 'BOL_CREATED':
      return 'LABEL_CREATED'
    case 'IN_TRANSIT':
    case 'PICKED_UP':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'EXCEPTION':
      return 'EXCEPTION'
    case 'RETURNED':
      return 'RETURNED'
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

// ─── Address helper ─────────────────────────────────────────────────────────

function toBolAddress(raw: SaiaBolAddress | null | undefined) {
  if (!raw) return undefined
  return toAddress({
    name: raw.ContactName,
    address1: raw.Address1,
    address2: raw.Address2,
    city: raw.City,
    state: raw.State,
    postal_code: raw.Zipcode,
  })
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: SaiaBolShipment): Shipment {
  return {
    id: raw.ProNumber ?? raw.BLNumber ?? undefined,
    status: mapBolStatus(raw.status),
    trackingNumber: raw.ProNumber ?? undefined,
    carrierId: 'saia',
    serviceCode: raw.ServiceLevel ?? undefined,
    mode: 'ltl',
    originAddress: toBolAddress(raw.Shipper),
    destinationAddress: toBolAddress(raw.Consignee),
    reference: raw.BLNumber ?? raw.ShipperNumber ?? undefined,
    labelUrl: raw.PDF ?? undefined,
    createdAt: toISODate(raw.ShipmentDate ?? raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
