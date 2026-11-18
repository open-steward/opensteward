import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

// ─── Forward Air raw types ────────────────────────────────────────────────
// Source: POST /ltlservices/v2/rest/waybills/book (FABookingResponse)
// and GET /ltlservices/v2/rest/waybills/{referenceNumber} (waybill response)

export interface ForwardAirBookingAddress {
  LocationName?: string | null
  Address1?: string | null
  Address2?: string | null
  City?: string | null
  State?: string | null
  ZipCode?: string | null
  Country?: string | null
  ContactName?: string | null
  ContactPhone?: string | null
  ContactEmail?: string | null
  [key: string]: unknown
}

export interface ForwardAirOrderResponse {
  AirbillNumber?: string | null
  OrderAction?: string | null
  ShippingDate?: string | null
  CurrentStatus?: string | null
  currentStatusDescription?: string | null
  Shipper?: ForwardAirBookingAddress | null
  Consignee?: ForwardAirBookingAddress | null
  OriginAirportCode?: string | null
  DestinationAirportCode?: string | null
  SpecialInstructions?: string | null
  ReferenceNumbers?: string[] | null
  ErrorMessage?: string | null
  Remarks?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch (status?.toUpperCase()) {
    case 'CREATED':
    case 'ACK':
    case 'PEND':       return 'PENDING'
    case 'RCV':
    case 'PUP':
    case 'PUPACK':     return 'PROCESSING'
    case 'DEP':
    case 'ARR':
    case 'ARRD':
    case 'IN_TRANSIT': return 'AWAITING_SHIPMENT'
    case 'OUTDV':
    case 'DLV':        return 'SHIPPED'
    case 'COMP':       return 'DELIVERED'
    case 'CANCEL':     return 'CANCELLED'
    default:           return 'PENDING'
  }
}

// ─── Address adapter (FABooking address shape → canonical) ──────────────────

function toFAAddress(raw: ForwardAirBookingAddress | null | undefined) {
  if (!raw) return undefined
  return toAddress({
    name: raw.ContactName,
    company: raw.LocationName,
    street1: raw.Address1,
    street2: raw.Address2,
    city: raw.City,
    state: raw.State,
    postalCode: raw.ZipCode,
    country: raw.Country,
    phone: raw.ContactPhone,
    email: raw.ContactEmail,
  })
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformOrder(raw: ForwardAirOrderResponse): Order {
  return {
    id: raw.AirbillNumber ?? undefined,
    orderNumber: raw.AirbillNumber ?? undefined,
    status: mapOrderStatus(raw.CurrentStatus ?? raw.currentStatusDescription),
    originAddress: toFAAddress(raw.Shipper),
    destinationAddress: toFAAddress(raw.Consignee),
    notes: raw.SpecialInstructions ?? undefined,
    orderAt: toISODate(raw.ShippingDate),
    createdAt: toISODate(raw.ShippingDate),
    metadata: raw as Record<string, unknown>,
  }
}
