import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import type { Address } from '../../../schema/shared'

/**
 * One row of GET /v2/shipment ("Get List of Shipments"),
 * https://docs.decklar.com/. Only the fields this transform reads are typed;
 * the whole row is kept in `metadata`.
 */
export interface RoambeeShipmentRow {
  shipment_id?: number
  uuid?: string
  shipment_status?: string
  /** Example 1631112243: epoch seconds. */
  updated_date?: number
  /** Example 1631112242000 (and the `$filter` example "created_date_timestamp gt 1631069132000"): epoch ms. */
  created_date_timestamp?: number
  /** Example 1632149972000: epoch ms. */
  scheduled_arrival?: number
  [key: string]: unknown
}

/** GET /v2/shipment response: `{ offset, size, total, data: [...] }`. */
export interface RoambeeShipmentList {
  offset?: number
  size?: number
  total?: number
  data?: RoambeeShipmentRow[]
}

/** An origin or destination of GET /v2/shipment/summary. */
export interface RoambeeLocation {
  name?: string
  address?: string
  [key: string]: unknown
}

/**
 * GET /v2/shipment/summary?uuid= ("Get Shipment Details"). The response
 * carries no uuid of its own; the caller's uuid is the id.
 */
export interface RoambeeShipmentSummary {
  name?: string
  description?: string
  /** Example 1613498400: epoch seconds. */
  scheduled_arrival?: number
  /** Example 1613453589: epoch seconds; 0 before arrival (the "Single Bee" example). */
  actual_arrival?: number
  /** Example 1612868387: epoch seconds. */
  created_date?: number
  origin?: RoambeeLocation
  destination?: RoambeeLocation
  [key: string]: unknown
}

// The only shipment_status value the docs show is "not started" (the
// GET /v2/shipment example). Anything else, including another casing of it,
// is UNKNOWN until documented.
const STATUS_MAP: ReadonlyMap<string, ShipmentStatus> = new Map([['not started', 'PENDING']])

function mapStatus(raw: string | undefined): ShipmentStatus {
  return (raw !== undefined ? STATUS_MAP.get(raw) : undefined) ?? 'UNKNOWN'
}

/** A positive epoch value as a Date; 0 and absent mean "not set". */
function fromEpoch(value: number | undefined, unitMs: 1 | 1000): Date | undefined {
  return typeof value === 'number' && value > 0 ? new Date(value * unitMs) : undefined
}

function location(loc: RoambeeLocation | undefined): Address | undefined {
  return loc?.address ? { street1: loc.address } : undefined
}

/** A GET /v2/shipment row. Throws when the row has no uuid, the id getShipment reads back. */
export function transformShipmentRow(row: RoambeeShipmentRow): Shipment {
  if (!row.uuid) throw new Error('Decklar shipment row has no uuid')
  return {
    id: row.uuid,
    status: mapStatus(row.shipment_status),
    estimatedDeliveryAt: fromEpoch(row.scheduled_arrival, 1),
    createdAt: fromEpoch(row.created_date_timestamp, 1),
    updatedAt: fromEpoch(row.updated_date, 1000),
    metadata: row,
  }
}

/** GET /v2/shipment/summary for `uuid`. */
export function transformShipmentSummary(uuid: string, raw: RoambeeShipmentSummary): Shipment {
  return {
    id: uuid,
    originAddress: location(raw.origin),
    destinationAddress: location(raw.destination),
    estimatedDeliveryAt: fromEpoch(raw.scheduled_arrival, 1000),
    actualDeliveryAt: fromEpoch(raw.actual_arrival, 1000),
    createdAt: fromEpoch(raw.created_date, 1000),
    notes: raw.description ?? undefined,
    metadata: raw,
  }
}
