import type { Pickup, PickupStatus } from '../../../schema/pickup'
import { toAddress, toISODate } from '../../shared/transform'

/**
 * `location.address` as Shippo echoes it back on a Pickup: the create-request
 * shape (`AddressCompleteCreateRequest`), not a stored Address object. There
 * is no `object_id` / `object_created` here, which is why this is not the
 * sibling `ShippoAddress`.
 */
export interface ShippoPickupAddress {
  name?: string | null
  company?: string | null
  street1?: string | null
  street2?: string | null
  street3?: string | null
  street_no?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  is_residential?: boolean | null
  validate?: boolean | null
  [key: string]: unknown
}

export interface ShippoPickupLocation {
  address?: ShippoPickupAddress | null
  /** One of Shippo's fixed set — "Front Door", "Shipping Dock", "Other", … */
  building_location_type?: string | null
  building_type?: string | null
  instructions?: string | null
  [key: string]: unknown
}

/** Response of `POST /pickups` — `PickupBase` plus the server-set fields. */
export interface ShippoPickup {
  object_id: string
  object_created?: string
  object_updated?: string
  carrier_account?: string | null
  location?: ShippoPickupLocation | null
  transactions?: string[] | null
  requested_start_time?: string | null
  requested_end_time?: string | null
  confirmed_start_time?: string | null
  confirmed_end_time?: string | null
  cancel_by_time?: string | null
  status?: string | null
  confirmation_code?: string | null
  timezone?: string | null
  messages?: string[] | null
  metadata?: string | null
  is_test?: boolean
  [key: string]: unknown
}

const STATUS_MAP: Record<string, PickupStatus> = {
  PENDING: 'PENDING',
  CONFIRMED: 'SCHEDULED',
  ERROR: 'FAILED',
  CANCELLED: 'CANCELLED',
}

function mapStatus(raw: string | null | undefined): PickupStatus {
  if (!raw) return 'unknown'
  return STATUS_MAP[raw.toUpperCase()] ?? 'unknown'
}

export function transformPickup(raw: ShippoPickup): Pickup {
  return {
    id: raw.object_id,
    confirmationNumber: raw.confirmation_code ?? undefined,
    // The carrier_account object id, as `createPickup` sent it. No 'shippo'
    // fallback: a pickup with no account is not a Shippo-carrier pickup.
    carrierId: raw.carrier_account ?? undefined,
    status: mapStatus(raw.status),
    address: toAddress(raw.location?.address),
    // The window the shipper asked for, so a create round-trips what was
    // sent. The carrier's answer — `confirmed_start_time`, `confirmed_end_time`
    // and `cancel_by_time` — stays in `metadata`.
    readyAt: toISODate(raw.requested_start_time),
    closeAt: toISODate(raw.requested_end_time),
    // Transaction (label) ids — the same reading manifest.ts makes.
    shipmentIds: raw.transactions ?? undefined,
    instructions: raw.location?.instructions ?? undefined,
    createdAt: toISODate(raw.object_created),
    updatedAt: toISODate(raw.object_updated),
    metadata: raw as Record<string, unknown>,
  }
}
