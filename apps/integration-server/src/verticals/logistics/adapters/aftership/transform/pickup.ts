import type { Pickup, PickupStatus } from '../../../schema/pickup'
import type { Package } from '../../../schema/shared'
import type { PickupRequestParams } from '../../../adapter/interface'
import { toAddress, toISODate } from '../../shared/transform'

// AfterShip Shipping API (Postmen v3) — POST /pickups, GET /pickups, GET /pickups/:id,
// POST /cancel-pickups
// Docs: https://www.aftership.com/docs/shipping/model/resource/pickup
// Status values: creating | created | failed | cancelling | cancelled
//
// The window is split into `pickup_date` (YYYY-MM-DD) plus `pickup_start_time` /
// `pickup_end_time` (HH:mm:ss) — wall-clock at the pickup address, with no
// offset anywhere on the record. Both directions read and write those as UTC,
// so the instant is the same on every machine (the way `toISODate` already
// reads a bare date) and a round trip is lossless. A caller who wants "09:00
// where the driver arrives" passes `2026-01-15T09:00:00Z`; the raw strings stay
// on `metadata` for anyone who knows the zone.

export interface AfterShipPickupAddress {
  contact_name: string
  street1: string
  /** ISO 3166-1 alpha-3 (`USA`), not the alpha-2 the canonical Address carries. */
  country: string
  phone?: string | null
  email?: string | null
  company_name?: string | null
  street2?: string | null
  street3?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  type?: 'residential' | 'business' | null
}

export interface AfterShipPickupParcel {
  weight: { unit: 'lb' | 'kg' | 'oz' | 'g'; value: number }
  quantity: number
  /** Required by AfterShip for UPS and DHL Express shipper accounts. */
  service_type?: string
  dimension?: {
    width: number
    height: number
    depth: number
    unit: 'cm' | 'in' | 'mm' | 'm' | 'ft' | 'yd'
  }
}

export interface AfterShipPickup {
  id: string
  status: string
  /** One per carrier dispatch — in practice a single entry. */
  pickup_confirmation_numbers?: string[] | null
  pickup_location_code?: string | null
  /** YYYY-MM-DD */
  pickup_date?: string | null
  /** HH:mm:ss, wall-clock at `pickup_from` */
  pickup_start_time?: string | null
  pickup_end_time?: string | null
  pickup_from?: AfterShipPickupAddress | null
  ship_to?: AfterShipPickupAddress | null
  label_ids?: string[] | null
  pickup_parcels?: AfterShipPickupParcel[] | null
  /** The model documents `{ id }` only; responses also carry the carrier `slug`. */
  shipper_account?: { id: string; slug?: string | null } | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/**
 * What `POST /cancel-pickups` answers with — a cancel-pickup record that
 * references the pickup, not the pickup itself. `cancelPickup` re-reads the
 * pickup after posting one of these.
 */
export interface AfterShipCancelPickup {
  id: string
  /** cancelling | cancelled | failed */
  status: string
  pickup?: { id: string } | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

/** Body of `POST /pickups`. */
export interface AfterShipPickupRequest {
  pickup_date: string
  pickup_start_time: string
  pickup_end_time: string
  /** AfterShip validates its own required fields (contact_name, street1, country). */
  pickup_from: Partial<AfterShipPickupAddress>
  label_ids?: string[]
  pickup_parcels?: AfterShipPickupParcel[]
  shipper_account?: { id: string }
  pickup_location?: string
  pickup_instructions?: string
}

function mapPickupStatus(status: string): PickupStatus {
  switch (status) {
    case 'creating':
      return 'PENDING'
    case 'created':
      return 'SCHEDULED'
    case 'failed':
      return 'FAILED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      // `cancelling` lands here on purpose: the carrier may still turn up, and
      // the cancel may still fail, so it is neither SCHEDULED nor CANCELLED.
      return 'unknown'
  }
}

/** `2023-09-21` + `09:00:00` → the instant `2023-09-21T09:00:00Z` (see header). */
function atWallClock(date: string | null | undefined, time: string | null | undefined) {
  if (!date || !time) return undefined
  return toISODate(`${date}T${time}Z`)
}

export function transformPickup(raw: AfterShipPickup): Pickup {
  return {
    id: raw.id,
    // The canonical field is one string; the array (rarely more than one
    // entry) stays on metadata.
    confirmationNumber: raw.pickup_confirmation_numbers?.[0] ?? undefined,
    carrierId: raw.shipper_account?.slug ?? undefined,
    status: mapPickupStatus(raw.status),
    // `country` is deliberately dropped: AfterShip returns ISO 3166-1 alpha-3
    // (`USA`) and the canonical `Iso3166Alpha2` rejects it. It stays readable
    // on `metadata.pickup_from.country`. `street3` has no canonical line either.
    address: raw.pickup_from
      ? toAddress({ ...raw.pickup_from, name: raw.pickup_from.contact_name, country: undefined })
      : undefined,
    // A date without a start time still says when the packages are ready (the
    // reading `toISODate` gives any bare date); a date without an end time
    // says nothing about when the window closes, so `closeAt` gets no fallback.
    readyAt: atWallClock(raw.pickup_date, raw.pickup_start_time) ?? toISODate(raw.pickup_date),
    closeAt: atWallClock(raw.pickup_date, raw.pickup_end_time),
    shipmentIds: raw.label_ids ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Canonical request → `POST /pickups` body. Throws, naming the key, for what
 * AfterShip needs and the canonical shape does not require:
 *
 *   - `closeAt`: `pickup_end_time` is mandatory upstream and there is no
 *     honest default for when a dock closes.
 *   - `address.country` as alpha-3: AfterShip rejects the canonical alpha-2
 *     and this adapter carries no conversion table, so the caller passes `USA`.
 *   - exactly one of `shipmentIds` (→ `label_ids`) or `packages` (→
 *     `pickup_parcels`): AfterShip refuses both and neither.
 *   - `shipperAccountId` (index signature) when scheduling by parcel: with no
 *     labels there is nothing else that says which carrier account collects.
 */
export function toPickupRequest(data: PickupRequestParams): AfterShipPickupRequest {
  if (!(data.closeAt instanceof Date)) {
    throw new Error('AfterShip pickups need closeAt: pickup_end_time is required')
  }
  const country = data.address.country
  if (typeof country !== 'string' || country.length !== 3) {
    throw new Error(
      `AfterShip pickups need address.country as ISO 3166-1 alpha-3 (e.g. USA), got ${JSON.stringify(country)}`,
    )
  }

  const labelIds = data.shipmentIds?.length ? data.shipmentIds : undefined
  const packages = data.packages?.length ? data.packages : undefined
  if (labelIds && packages) {
    throw new Error(
      'AfterShip pickups take shipmentIds (label_ids) or packages (pickup_parcels), not both',
    )
  }
  if (!labelIds && !packages) {
    throw new Error('AfterShip pickups need shipmentIds (label_ids) or packages (pickup_parcels)')
  }
  const shipperAccountId = data.shipperAccountId
  if (packages && typeof shipperAccountId !== 'string') {
    throw new Error('AfterShip pickups by parcel need shipperAccountId (shipper_account.id)')
  }

  const serviceType = typeof data.serviceType === 'string' ? data.serviceType : undefined
  const pickupLocation = typeof data.pickupLocation === 'string' ? data.pickupLocation : undefined
  const ready = data.readyAt.toISOString()

  return {
    // One `pickup_date` for the whole window: the day the window opens.
    pickup_date: ready.slice(0, 10),
    pickup_start_time: ready.slice(11, 19),
    pickup_end_time: data.closeAt.toISOString().slice(11, 19),
    pickup_from: {
      contact_name: data.address.name,
      company_name: data.address.company,
      street1: data.address.street1,
      street2: data.address.street2,
      city: data.address.city,
      state: data.address.state,
      postal_code: data.address.postalCode,
      country,
      phone: data.address.phone,
      email: data.address.email,
    },
    label_ids: labelIds,
    pickup_parcels: packages?.map((p, i) => toPickupParcel(p, i, serviceType)),
    shipper_account: typeof shipperAccountId === 'string' ? { id: shipperAccountId } : undefined,
    pickup_location: pickupLocation,
    pickup_instructions: data.instructions,
  }
}

/** One canonical Package is one parcel, so `quantity` is always 1. */
function toPickupParcel(pkg: Package, index: number, serviceType?: string): AfterShipPickupParcel {
  if (!pkg.weight) {
    throw new Error(`AfterShip pickup_parcels need a weight: packages[${index}].weight is missing`)
  }
  return {
    weight: { unit: pkg.weight.unit, value: pkg.weight.value },
    quantity: 1,
    service_type: serviceType,
    dimension: pkg.dimensions
      ? {
          width: pkg.dimensions.width,
          height: pkg.dimensions.height,
          depth: pkg.dimensions.length,
          unit: pkg.dimensions.unit,
        }
      : undefined,
  }
}
