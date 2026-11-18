import type { Order, OrderStatus } from '../../../schema/order'
import { toAddress, toISODate } from '../../shared/transform'

// ─── DHL Global Forwarding Shipment Booking raw types ────────────────────────
// Source: POST /shipment-booking  (https://api.dhl.com/dgff/transportation/shipment-booking)

export interface DhlGfBookingParty {
  name?: string | null
  address?: {
    addressLine1?: string | null
    addressLine2?: string | null
    city?: string | null
    stateProvince?: string | null
    postalCode?: string | null
    countryCode?: string | null
  } | null
  contact?: {
    phone?: string | null
    email?: string | null
  } | null
  [key: string]: unknown
}

export interface DhlGfBookingGoodsLine {
  description?: string | null
  quantity?: number | null
  weight?: number | null
  weightUom?: string | null
  [key: string]: unknown
}

export interface DhlGfBookingResponse {
  bookingId: string
  externalBookingId?: string | null
  status?: string | null
  housebillNumber?: string | null
  shipmentId?: string | null
  serviceCode?: string | null
  productCode?: string | null
  origin?: DhlGfBookingParty | null
  destination?: DhlGfBookingParty | null
  shipper?: DhlGfBookingParty | null
  consignee?: DhlGfBookingParty | null
  goodsLines?: DhlGfBookingGoodsLine[] | null
  notes?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ─── Status mapping ───────────────────────────────────────────────────────────

function mapBookingStatus(status: string | null | undefined): OrderStatus {
  const key = (status ?? '').toLowerCase().replace(/[\s_-]+/g, '_')
  switch (key) {
    case 'accepted':
    case 'in_progress':           return 'PROCESSING'
    case 'shipment_created':      return 'AWAITING_SHIPMENT'
    case 'shipped':               return 'SHIPPED'
    case 'delivered':             return 'DELIVERED'
    case 'cancelled':
    case 'shipment_could_not_be_created': return 'CANCELLED'
    default:                      return 'PENDING'
  }
}

// ─── Address helper (maps DGF party → canonical Address) ─────────────────────

function partyToAddressRaw(party: DhlGfBookingParty | null | undefined): Record<string, unknown> | null {
  if (!party) return null
  return {
    name: party.name,
    address_line1: party.address?.addressLine1,
    address_line2: party.address?.addressLine2,
    city: party.address?.city,
    state_province: party.address?.stateProvince,
    postal_code: party.address?.postalCode,
    country_code: party.address?.countryCode,
    phone: party.contact?.phone,
    email: party.contact?.email,
  }
}

// ─── Transform ────────────────────────────────────────────────────────────────

export function transformOrder(raw: DhlGfBookingResponse): Order {
  const originRaw = partyToAddressRaw(raw.origin ?? raw.shipper)
  const destRaw = partyToAddressRaw(raw.destination ?? raw.consignee)

  return {
    id: raw.bookingId,
    status: mapBookingStatus(raw.status),
    orderNumber: raw.externalBookingId ?? raw.bookingId,
    shipmentIds: raw.shipmentId ? [raw.shipmentId] : undefined,
    originAddress: toAddress(originRaw),
    destinationAddress: toAddress(destRaw),
    requestedServiceCode: raw.serviceCode ?? raw.productCode ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
