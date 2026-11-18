import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, parseDecimal } from '../../shared/transform'
import { PacketaClient } from '../client'

/**
 * Packeta packet — the fields returned in a <createPacket> or <packetStatus> response.
 * Packeta responses are XML; this interface represents the parsed key/value pairs.
 */
export interface PacketaPacket {
  /** Packeta-assigned barcode, e.g. "Z1234567890" */
  id?: string
  barcode?: string
  barcodeText?: string
  /** Order/eshop reference number */
  number?: string
  /** Recipient fields */
  name?: string
  surname?: string
  company?: string
  email?: string
  phone?: string
  /** Destination address (for home-delivery packets) */
  street?: string
  houseNumber?: string
  city?: string
  zip?: string
  /** ISO 3166-1 alpha-2 country code */
  country?: string
  /** Packeta pickup-point branch ID */
  addressId?: string
  /** Weight in kg */
  weight?: string
  /** Cash-on-delivery amount */
  cod?: string
  /** Declared value */
  value?: string
  currency?: string
  /** Carrier code for home-delivery routing */
  carrierCode?: string
  carrierPickupPoint?: string
  /** Packet status code (from packetStatus response) */
  statusCode?: string
  statusText?: string
  /** ISO 8601 datetime strings */
  createdAt?: string
  updatedAt?: string
  /** Raw sender/eshop identifier */
  eshop?: string
  [key: string]: unknown
}

/**
 * Map a Packeta status code to a canonical ShipmentStatus.
 *
 * Packeta status codes (numeric strings):
 *   1  = Pending / received
 *   2  = Arrived at depot
 *   3  = Ready for dispatch
 *   4  = In transit
 *   5  = Delivered
 *   6  = Returned to sender
 *   7  = Out for delivery
 *   8  = Cancelled
 *   9  = Exception / problem
 */
function mapPacketaStatus(code: string | undefined): ShipmentStatus {
  switch (code) {
    case '1':  return 'PENDING'
    case '2':
    case '3':  return 'LABEL_CREATED'
    case '4':  return 'IN_TRANSIT'
    case '7':  return 'OUT_FOR_DELIVERY'
    case '5':  return 'DELIVERED'
    case '6':  return 'RETURNED'
    case '8':  return 'CANCELLED'
    case '9':  return 'EXCEPTION'
    default:   return 'UNKNOWN'
  }
}

export function transformShipment(raw: PacketaPacket): Shipment {
  const barcode = raw.barcode ?? raw.id ?? undefined

  // Build destination address from home-delivery fields if present
  const hasDestAddress = raw.street ?? raw.city ?? raw.zip ?? raw.country
  const destinationAddress = hasDestAddress
    ? {
        name: [raw.name, raw.surname].filter(Boolean).join(' ') || undefined,
        company: raw.company ?? undefined,
        street1: [raw.street, raw.houseNumber].filter(Boolean).join(' ') || undefined,
        city: raw.city ?? undefined,
        postalCode: raw.zip ?? undefined,
        country: raw.country ?? undefined,
        phone: raw.phone ?? undefined,
        email: raw.email ?? undefined,
      }
    : undefined

  const weight = parseDecimal(raw.weight)
  const cod = parseDecimal(raw.cod)
  const currency = raw.currency ?? undefined

  return {
    id: barcode,
    status: mapPacketaStatus(raw.statusCode),
    trackingNumber: barcode,
    carrierId: raw.carrierCode ?? 'packeta',
    serviceCode: raw.carrierCode ?? undefined,
    destinationAddress,
    totalWeight: weight !== undefined ? { value: weight, unit: 'kg' } : undefined,
    cost:
      cod !== undefined && currency
        ? { amount: cod, currency }
        : undefined,
    reference: raw.number ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Parse a Packeta XML response and extract packet fields into a PacketaPacket.
 * This is a lightweight extractor — it pulls all known scalar fields by tag name.
 */
export function parsePacketXml(xml: string): PacketaPacket {
  const fields: (keyof PacketaPacket)[] = [
    'id', 'barcode', 'barcodeText', 'number', 'name', 'surname', 'company',
    'email', 'phone', 'street', 'houseNumber', 'city', 'zip', 'country',
    'addressId', 'weight', 'cod', 'value', 'currency', 'carrierCode',
    'carrierPickupPoint', 'statusCode', 'statusText', 'createdAt', 'updatedAt', 'eshop',
  ]
  const result: PacketaPacket = {}
  for (const field of fields) {
    const val = PacketaClient.extract(xml, field as string)
    if (val !== undefined) {
      result[field] = val
    }
  }
  return result
}
