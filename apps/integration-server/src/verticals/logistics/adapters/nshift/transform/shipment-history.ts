import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * One row of GET /shipments-history, as documented by the Unifaun/nShift
 * REST API RAML (https://api.unifaun.com/rs-extapi/v1/documentation/root-resource-v1.raml,
 * schema `shipmentFetchInfoList`, ShipmentFetchInfoList.jsonschema). Only the
 * fields this transform reads are typed; the rest stay in `metadata`.
 *
 * Documented example row:
 *   "id": "5666306", "status": "PRINTED", "shipmentNo": null,
 *   "orderNo": "order number 123", "reference": "sender ref 234",
 *   "serviceId": "P15", "sndName": "nShift Gbg", "sndZipcode": "41121",
 *   "sndCity": "GÖTEBORG", "sndCountry": "SE", "rcvName": "nShift Sthm", ...
 *   "created": "2015-06-03T13:18:30.904+0000",
 *   "changed": "2015-06-03T13:18:30.904+0000",
 *   "parcels": [{ "parcelNo": "373325389893906035", ... }]
 */
export interface NShiftHistoryParcel {
  parcelNo?: string | null
  returnParcelNo?: string | null
  reference?: string | null
  partOrderNo?: string | null
}

export interface NShiftHistoryShipment {
  href: string
  id: string
  status?: string | null
  shipmentNo?: string | null
  orderNo?: string | null
  reference?: string | null
  serviceId?: string | null
  parcelCount?: number | null
  sndName?: string | null
  sndZipcode?: string | null
  sndCity?: string | null
  sndCountry?: string | null
  rcvName?: string | null
  rcvZipcode?: string | null
  rcvCity?: string | null
  rcvCountry?: string | null
  created?: string | null
  changed?: string | null
  shipDate?: string | null
  parcels?: NShiftHistoryParcel[] | null
  [key: string]: unknown
}

/** The documented page envelope of GET /shipments-history (example response). */
export interface NShiftHistoryPage {
  page?: number
  totalPages?: number
  shipments?: NShiftHistoryShipment[] | null
}

/**
 * The status values the RAML documents for /shipments-history's `status`
 * filter: `[ '', printed, dispatching, outfordelivery, delivering, delivered,
 * partdelivered, returned, cancelled ]`. The response example carries them
 * upper-case ("PRINTED"), so they are compared case-insensitively. Anything
 * else is 'UNKNOWN'.
 */
const STATUS: Record<string, ShipmentStatus> = {
  PRINTED: 'LABEL_CREATED',
  DISPATCHING: 'IN_TRANSIT',
  DELIVERING: 'IN_TRANSIT',
  PARTDELIVERED: 'IN_TRANSIT',
  OUTFORDELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
}

function mapStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  return STATUS[status.toUpperCase()] ?? 'UNKNOWN'
}

const ALPHA2 = /^[A-Z]{2}$/

function party(
  name: string | null | undefined,
  zipcode: string | null | undefined,
  city: string | null | undefined,
  country: string | null | undefined,
): Address | undefined {
  const address: Address = {}
  if (name) address.name = name
  if (zipcode) address.postalCode = zipcode
  if (city) address.city = city
  // The example carries ISO 3166 alpha-2 ("SE"); anything else is omitted, not guessed.
  if (country && ALPHA2.test(country)) address.country = country as Address['country']
  return Object.keys(address).length > 0 ? address : undefined
}

/**
 * `carrierId` is left out: it names a Carrier.id (a partner id from
 * /meta/lists/partners) and the documented history row carries no partner
 * field, so any value here would be a foreign key that never resolves.
 */
export function transformHistoryShipment(raw: NShiftHistoryShipment): Shipment {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    trackingNumber: raw.parcels?.[0]?.parcelNo ?? undefined,
    serviceCode: raw.serviceId ?? undefined,
    originAddress: party(raw.sndName, raw.sndZipcode, raw.sndCity, raw.sndCountry),
    destinationAddress: party(raw.rcvName, raw.rcvZipcode, raw.rcvCity, raw.rcvCountry),
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.changed),
    metadata: raw as Record<string, unknown>,
  }
}
