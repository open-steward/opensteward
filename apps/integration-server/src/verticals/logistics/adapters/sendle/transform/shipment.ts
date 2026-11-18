import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toWeight, toDimensions, parseDecimal, toISODate } from '../../shared/transform'

// ─── Sendle raw types ────────────────────────────────────────────────────────

export interface SendleContact {
  name: string | null
  phone: string | null
  email: string | null
  company: string | null
}

export interface SendleAddress {
  address_line1: string | null
  address_line2: string | null
  suburb: string | null
  state_name: string | null
  postcode: string | null
  country: string | null
}

export interface SendleParty {
  contact: SendleContact | null
  address: SendleAddress | null
}

export interface SendlePrice {
  gross: { amount: number; currency: string }
  net: { amount: number; currency: string }
  tax: { amount: number; currency: string }
}

export interface SendleScheduling {
  is_cancellable: boolean
  pickup_date: string
  picked_up_on: string | null
  delivered_on: string | null
  estimated_delivery_date_minimum: string | null
  estimated_delivery_date_maximum: string | null
}

export interface SendleLabelEntry {
  format: string
  size: string
  url: string
}

export interface SendleOrder {
  order_id: string
  state: string
  sendle_reference: string
  tracking_url: string | null
  order_url: string | null
  description: string | null
  customer_reference: string | null
  metadata: Record<string, unknown> | null
  labels: SendleLabelEntry[] | null
  scheduling: SendleScheduling | null
  weight: { value: string; units: string } | null
  kilogram_weight: string | null
  dimensions: { length: string; width: string; height: string; units: string } | null
  sender: SendleParty | null
  receiver: SendleParty | null
  price: SendlePrice | null
  route: { description: string; type: string } | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapShipmentStatus(state: string): ShipmentStatus {
  switch (state) {
    case 'Booking':
    case 'Pickup':
    case 'Drop Off':
    case 'Pickup Attempted':
    case 'Dropped Off':          return 'PENDING'
    case 'Transit':              return 'IN_TRANSIT'
    case 'Delivered':            return 'DELIVERED'
    case 'Cancelled':            return 'CANCELLED'
    case 'Expired':              return 'CANCELLED'
    case 'Unable to Book':
    case 'Lost':                 return 'EXCEPTION'
    case 'Return to Sender':     return 'RETURNED'
    default:                     return 'UNKNOWN'
  }
}

// ─── Address transform ───────────────────────────────────────────────────────

export function transformSendleAddress(party: SendleParty | null): Address | undefined {
  if (!party) return undefined
  const contact = party.contact
  const addr = party.address
  const result: Address = {
    name: contact?.name ?? undefined,
    company: contact?.company ?? undefined,
    phone: contact?.phone ?? undefined,
    email: contact?.email ?? undefined,
    street1: addr?.address_line1 ?? undefined,
    street2: addr?.address_line2 ?? undefined,
    city: addr?.suburb ?? undefined,
    state: addr?.state_name ?? undefined,
    postalCode: addr?.postcode ?? undefined,
    country: addr?.country ?? undefined,
  }
  const hasAny = Object.values(result).some((v) => v !== undefined)
  return hasAny ? result : undefined
}

// ─── Shipment transform ─────────────────────────────────────────────────────

export function transformShipment(raw: SendleOrder): Shipment {
  const weightUnit = (raw.weight?.units?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  const dimUnit = (raw.dimensions?.units?.toLowerCase() === 'in' ? 'in' : 'cm') as 'in' | 'cm'

  return {
    id: raw.order_id,
    status: mapShipmentStatus(raw.state),
    trackingNumber: raw.sendle_reference ?? undefined,
    carrierId: 'sendle',
    originAddress: transformSendleAddress(raw.sender),
    destinationAddress: transformSendleAddress(raw.receiver),
    totalWeight: raw.weight ? toWeight(raw.weight.value, weightUnit) : undefined,
    dimensions: raw.dimensions
      ? toDimensions(raw.dimensions.length, raw.dimensions.width, raw.dimensions.height, dimUnit)
      : undefined,
    labelUrl: raw.labels?.[0]?.url ?? undefined,
    cost: raw.price
      ? {
          amount: parseDecimal(raw.price.gross.amount) ?? 0,
          currency: raw.price.gross.currency ?? 'AUD',
        }
      : undefined,
    reference: raw.customer_reference ?? undefined,
    createdAt: toISODate(raw.scheduling?.pickup_date),
    metadata: raw as Record<string, unknown>,
  }
}
