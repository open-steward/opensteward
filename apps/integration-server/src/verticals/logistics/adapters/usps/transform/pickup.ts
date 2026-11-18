import type { Pickup, PickupStatus } from '../../../schema/pickup'
import type { Address, Package } from '../../../schema/shared'
import type { PickupRequestParams, PickupCancelParams } from '../../../adapter/interface'
import { toISODate } from '../../shared/transform'

// Shapes from the Carrier Pickup v3 spec (carrier-pickup_7.yaml, 3.1.9):
// POST /carrier-pickup and GET /carrier-pickup/{confirmationNumber} both
// answer with PickupConfirmation, which echoes the SchedulePickupRequest back
// under `carrierPickupRequest`. USPS returns no status field on any of them.

export interface USPSPickupAddress {
  firstName: string
  lastName: string
  firm?: string | null
  address: {
    streetAddress: string
    streetAddressAbbreviation?: string | null
    secondaryAddress?: string | null
    city?: string | null
    cityAbbreviation?: string | null
    state?: string | null
    ZIPCode?: string | null
    ZIPPlus4?: string | null
    urbanization?: string | null
    [key: string]: unknown
  }
  // One or two NotificationMethod entries — `{ email }` and/or `{ cellNumber }`.
  contact: Array<{ email?: string; cellNumber?: string }>
  [key: string]: unknown
}

// `additionalProperties: false` on the request, its packages and its
// pickupLocation — no index signature here on purpose.
export interface USPSSchedulePickupRequest {
  pickupDate: string
  pickupAddress: USPSPickupAddress
  packages: Array<{ packageType: string; packageCount: number }>
  estimatedWeight: number
  pickupLocation: {
    packageLocation: string
    specialInstructions?: string
    dogPresent?: boolean
  }
  nextAvailablePickup?: boolean
}

export interface USPSPickupConfirmation {
  confirmationNumber: string
  pickupDate: string | null
  carrierPickupRequest: USPSSchedulePickupRequest | null
  [key: string]: unknown
}

const PACKAGE_TYPES =
  'FIRST-CLASS_PACKAGE_SERVICE | PRIORITY_MAIL_EXPRESS | PRIORITY_MAIL | RETURNS | USPS_GROUND_ADVANTAGE | INTERNATIONAL | OTHER'

const PACKAGE_LOCATIONS =
  'FRONT_DOOR | BACK_DOOR | SIDE_DOOR | KNOCK_ON_DOOR | MAIL_ROOM | OFFICE | PORCH | RECEPTION | MAILBOX | OTHER'

// ─── outbound ───────────────────────────────────────────────────────────────

/**
 * Canonical pickup request → SchedulePickupRequest.
 *
 * USPS needs three things the canonical params only carry on the index
 * signature, and throws naming each rather than guessing: `packageType` (the
 * mail class of the packages), `packageLocation` (derived as `OTHER` when only
 * free-text `instructions` were given, since the spec makes
 * `specialInstructions` the OTHER location's description) and
 * `estimatedWeight` in pounds when the canonical packages carry no weights.
 * `closeAt`, `carrierId` and `shipmentIds` have no USPS counterpart — a
 * carrier pickup is a date, not a window, and is scheduled by mail-class
 * counts rather than by tracking number.
 */
export function buildPickupRequest(data: PickupRequestParams): USPSSchedulePickupRequest {
  const { address } = data

  const packageType = typeof data.packageType === 'string' ? data.packageType : undefined
  if (!packageType) {
    throw new Error(
      `usps: createPickup needs \`packageType\` (${PACKAGE_TYPES}) — the mail class is not part of the canonical package`,
    )
  }

  const packages = data.packages
  if (!packages?.length)
    throw new Error('usps: createPickup needs at least one entry in `packages`')

  const estimatedWeight = totalPounds(packages) ?? numberOrUndefined(data.estimatedWeight)
  if (estimatedWeight === undefined) {
    throw new Error(
      'usps: createPickup needs a weight on every package, or `estimatedWeight` (aggregate pounds)',
    )
  }

  const packageLocation =
    typeof data.packageLocation === 'string'
      ? data.packageLocation
      : data.instructions
        ? 'OTHER'
        : undefined
  if (!packageLocation) {
    throw new Error(
      `usps: createPickup needs \`packageLocation\` (${PACKAGE_LOCATIONS}) or \`instructions\``,
    )
  }

  return {
    // Same UTC calendar-date reading `getRates` and `createManifest` give `mailingDate`.
    pickupDate: data.readyAt.toISOString().slice(0, 10),
    pickupAddress: toUSPSPickupAddress(address),
    packages: [{ packageType, packageCount: packages.length }],
    estimatedWeight,
    pickupLocation: {
      packageLocation,
      specialInstructions: data.instructions,
      dogPresent: typeof data.dogPresent === 'boolean' ? data.dogPresent : undefined,
    },
    nextAvailablePickup:
      typeof data.nextAvailablePickup === 'boolean' ? data.nextAvailablePickup : undefined,
  }
}

function toUSPSPickupAddress(address: Address): USPSPickupAddress {
  // Addressee requires firstName AND lastName (minLength 1 each): the last
  // whitespace-separated token is the surname, everything before it the
  // given name(s).
  const tokens = (address.name ?? '').trim().split(/\s+/).filter(Boolean)
  if (tokens.length < 2) {
    throw new Error('usps: createPickup needs `address.name` with a first and last name')
  }
  const lastName = tokens[tokens.length - 1]!
  const firstName = tokens.slice(0, -1).join(' ')

  if (!address.street1) throw new Error('usps: createPickup needs `address.street1`')

  // '94114-1234' → ZIPCode '94114' + ZIPPlus4 '1234'; a bare ZIP passes as-is.
  const [ZIPCode, ZIPPlus4] = address.postalCode ? address.postalCode.split('-') : []

  // Contact wants ≥ 1 NotificationMethod; SMS needs exactly ten digits, no
  // punctuation, so '+1 415 555 0123' becomes '4155550123' and anything that
  // does not reduce to ten digits is left out rather than sent to fail.
  const contact: USPSPickupAddress['contact'] = []
  if (address.email) contact.push({ email: address.email })
  const cellNumber = tenDigits(address.phone)
  if (cellNumber) contact.push({ cellNumber })
  if (contact.length === 0) {
    throw new Error('usps: createPickup needs `address.email` or a ten-digit `address.phone`')
  }

  return {
    firstName,
    lastName,
    firm: address.company,
    address: {
      streetAddress: address.street1,
      secondaryAddress: address.street2,
      city: address.city,
      state: address.state,
      ZIPCode,
      ZIPPlus4,
    },
    contact,
  }
}

/** Aggregate pounds across packages; undefined as soon as one has no weight. */
function totalPounds(packages: Package[]): number | undefined {
  let total = 0
  for (const pkg of packages) {
    const w = pkg.weight
    if (!w) return undefined
    switch (w.unit) {
      case 'oz':
        total += w.value / 16
        break
      case 'lb':
        total += w.value
        break
      case 'g':
        total += w.value / 453.59237
        break
      case 'kg':
        total += w.value * 2.2046226218
        break
    }
  }
  return Math.round(total * 100) / 100
}

function tenDigits(phone: string | undefined): string | undefined {
  if (!phone) return undefined
  let digits = phone.replace(/\D/g, '')
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1)
  return digits.length === 10 ? digits : undefined
}

function numberOrUndefined(val: unknown): number | undefined {
  return typeof val === 'number' && !isNaN(val) ? val : undefined
}

// ─── inbound ────────────────────────────────────────────────────────────────

export function transformPickup(raw: USPSPickupConfirmation): Pickup {
  const request = raw.carrierPickupRequest ?? undefined

  // USPS carries no status: a PickupConfirmation exists only while the pickup
  // is scheduled, and DELETE removes it outright ("can no longer be updated
  // or cancelled once cancelled"). Nothing here can map to 'unknown' because
  // there is no upstream value to fail to map.
  const status: PickupStatus = 'SCHEDULED'

  return {
    id: raw.confirmationNumber,
    confirmationNumber: raw.confirmationNumber || undefined,
    carrierId: 'usps',
    status,
    address: toPickupAddress(request?.pickupAddress),
    // Top-level `pickupDate` is the scheduled date; the echoed request's is
    // what was asked for, which differs when `nextAvailablePickup` rolled it.
    readyAt: toISODate(raw.pickupDate ?? request?.pickupDate),
    instructions: request?.pickupLocation?.specialInstructions || undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * `DELETE /carrier-pickup/{confirmationNumber}` answers 200 with no body, so
 * the cancelled record is synthesised from the id and the cancel request —
 * there is nothing upstream to read back.
 */
export function transformCancelledPickup(id: string, data?: PickupCancelParams): Pickup {
  return {
    id,
    confirmationNumber: id,
    carrierId: 'usps',
    status: 'CANCELLED',
    metadata: data,
  }
}

function toPickupAddress(raw: USPSPickupAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const name = [raw.firstName, raw.lastName].filter(Boolean).join(' ')
  const contact = raw.contact ?? undefined
  const addr: Address = {
    name: name || undefined,
    company: raw.firm || undefined,
    street1: raw.address?.streetAddress || undefined,
    street2: raw.address?.secondaryAddress || undefined,
    city: raw.address?.city || undefined,
    state: raw.address?.state || undefined,
    postalCode: joinZip(raw.address?.ZIPCode, raw.address?.ZIPPlus4),
    // Carrier Pickup is domestic-only and the response has no country field;
    // `country` stays undefined rather than a fabricated 'US'.
    phone: contact?.find((c) => c.cellNumber)?.cellNumber || undefined,
    email: contact?.find((c) => c.email)?.email || undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

function joinZip(
  zip: string | null | undefined,
  plus4: string | null | undefined,
): string | undefined {
  if (!zip) return undefined
  return plus4 ? `${zip}-${plus4}` : zip
}
