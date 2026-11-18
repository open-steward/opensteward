import type { Pickup } from '../../../schema/pickup'
import type { PickupRequestParams, PickupCancelParams } from '../../../adapter/interface'

/**
 * FedEx Pickup API — `POST /pickup/v1/pickups` and `PUT /pickup/v1/pickups/cancel`.
 *
 * Both responses are thin: a confirmation code, the Express dispatch station
 * and optional alerts. Nothing about the address or the window is echoed
 * back, so the canonical record is assembled from the request that produced
 * it. Neither response carries a status field — a 200 from create *is*
 * "scheduled" and a 200 from cancel *is* "cancelled"; a pickup that could not
 * be scheduled comes back as a 4xx, never as a status value. There is no
 * upstream enum to map and so no `'unknown'` branch.
 */

export interface FedExAlert {
  code?: string
  alertType?: 'NOTE' | 'WARNING' | string
  message?: string
}

/** `output` of `POST /pickup/v1/pickups` (CreatePickupOutputVO). */
export interface FedExCreatePickupOutput {
  pickupConfirmationCode: string
  /** Express dispatch station (e.g. `COSA`). Only returned for Express; cancelling an Express pickup needs it back. */
  location?: string
  alerts?: FedExAlert[]
  [key: string]: unknown
}

export interface FedExCreatePickupResponse {
  transactionId?: string
  customerTransactionId?: string
  output?: FedExCreatePickupOutput
}

/** `output` of `PUT /pickup/v1/pickups/cancel` (CancelPickupOutputVO). */
export interface FedExCancelPickupOutput {
  pickupConfirmationCode?: string
  cancelConfirmationMessage?: string
  alerts?: FedExAlert[]
  [key: string]: unknown
}

export interface FedExCancelPickupResponse {
  transactionId?: string
  customerTransactionId?: string
  output?: FedExCancelPickupOutput
}

// ─── response → canonical ───────────────────────────────────────────────────

export function transformPickup(
  raw: FedExCreatePickupOutput,
  request: PickupRequestParams,
): Pickup {
  return {
    id: raw.pickupConfirmationCode,
    confirmationNumber: raw.pickupConfirmationCode,
    carrierId: 'fedex',
    // A confirmation code is FedEx's whole notion of "scheduled".
    status: 'SCHEDULED',
    address: request.address,
    readyAt: request.readyAt ?? undefined,
    closeAt: request.closeAt ?? undefined,
    shipmentIds: request.shipmentIds ?? undefined,
    instructions: request.instructions ?? undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformCancelledPickup(raw: FedExCancelPickupOutput, id: string): Pickup {
  return {
    id,
    confirmationNumber: raw.pickupConfirmationCode ?? undefined,
    carrierId: 'fedex',
    status: 'CANCELLED',
    metadata: raw as Record<string, unknown>,
  }
}

// ─── canonical → request ────────────────────────────────────────────────────

/**
 * FedEx request keys a caller may pass verbatim on the index signature. They
 * are copied across only when present, so nothing canonical (`address`,
 * `readyAt`, …) leaks onto the wire and nothing FedEx-specific is defaulted.
 */
const TOP_LEVEL_PASSTHROUGH = [
  'associatedAccountNumberType',
  'totalWeight',
  'packageCount',
  'trackingNumber',
  'commodityDescription',
  'countryRelationships',
  'pickupType',
  'oversizePackageCount',
  'requestedExpressPickupDetail',
  'expressFreightDetail',
  'pickupNotificationDetail',
  'pickupChargesPayment',
] as const

const ORIGIN_DETAIL_PASSTHROUGH = [
  'pickupAddressType',
  'pickupDateType',
  'packageLocation',
  'buildingPart',
  'buildingPartDescription',
  'earlyPickup',
  'suppliesRequested',
  'geographicalPostalCode',
] as const

/** What each key is for, so the error a caller sees says why FedEx needs it. */
const CREATE_HINTS: Record<string, string> = {
  carrierCode: 'FedEx operating company: FDXE for Express, FDXG for Ground',
  accountNumber:
    'FedEx account the pickup is billed to, or set accountNumber in the adapter config',
  address: 'where the courier collects',
  readyAt: 'when the packages are ready, or readyDateTimestamp as local YYYY-MM-DDTHH:MM:SS',
  closeAt: 'when the location closes, or customerCloseTime as local HH:MM:SS',
  timeZone:
    'IANA zone of the pickup address, e.g. America/Chicago — FedEx reads pickup times as local wall-clock and ignores any offset',
  packageLocation: 'FRONT, REAR, SIDE or NONE; FedEx requires it for Ground',
}

const CANCEL_HINTS: Record<string, string> = {
  carrierCode: 'FedEx operating company the pickup was created with: FDXE or FDXG',
  accountNumber:
    'FedEx account the pickup was created under, or set accountNumber in the adapter config',
  scheduledDate: 'the dispatch date as YYYY-MM-DD',
  location: 'the Express dispatch station returned as `location` when the pickup was created',
}

/**
 * Build the body of `POST /pickup/v1/pickups`.
 *
 * FedEx reads `readyDateTimestamp` (`YYYY-MM-DDTHH:MM:SS`) and
 * `customerCloseTime` (`HH:MM:SS`) as wall-clock time local to the pickup
 * postal code and ignores any zone designator. A canonical `Date` is an
 * instant, and nothing here knows the postal code's zone, so the caller
 * names it: `timeZone` (IANA) converts `readyAt`/`closeAt`, or the literal
 * FedEx strings on the index signature are sent as-is and win. Formatting
 * the UTC wall-clock instead would be silently hours off for every US pickup
 * — and invisible in a UTC container.
 *
 * Throws one error naming every missing key rather than letting FedEx
 * answer a 400 for the first of them.
 */
export function buildCreatePickupBody(
  data: PickupRequestParams,
  configAccountNumber: string | undefined,
): Record<string, unknown> {
  const missing: string[] = []

  const carrierCode = stringParam(data, 'carrierCode')
  if (!carrierCode) missing.push('carrierCode')

  const accountNumber = stringParam(data, 'accountNumber') ?? configAccountNumber
  if (!accountNumber) missing.push('accountNumber')

  const address = data.address
  if (!address) missing.push('address')

  const timeZone = stringParam(data, 'timeZone')
  const readyAt = isDate(data.readyAt) ? data.readyAt : undefined
  const closeAt = isDate(data.closeAt) ? data.closeAt : undefined
  const readyLiteral = stringParam(data, 'readyDateTimestamp')
  const closeLiteral = stringParam(data, 'customerCloseTime')
  if (!readyLiteral && !readyAt) missing.push('readyAt')
  if (!closeLiteral && !closeAt) missing.push('closeAt')
  const needsZone = (!readyLiteral && readyAt) || (!closeLiteral && closeAt)
  if (needsZone && !timeZone) missing.push('timeZone')

  // Mandatory for Ground per the Pickup spec; Express does not read it.
  if (carrierCode === 'FDXG' && !stringParam(data, 'packageLocation')) {
    missing.push('packageLocation')
  }

  if (missing.length > 0 || !address || !accountNumber) {
    throw new Error(`fedex: createPickup requires ${describeMissing(missing, CREATE_HINTS)}`)
  }

  const readyDateTimestamp =
    readyLiteral ?? (readyAt && timeZone ? localTimestamp(readyAt, timeZone) : undefined)
  const customerCloseTime =
    closeLiteral ?? (closeAt && timeZone ? localTime(closeAt, timeZone) : undefined)

  return {
    associatedAccountNumber: { value: accountNumber },
    carrierCode,
    originDetail: {
      pickupLocation: {
        contact: {
          personName: address.name,
          companyName: address.company,
          phoneNumber: address.phone,
        },
        address: {
          streetLines: [address.street1, address.street2].filter(Boolean),
          city: address.city,
          stateOrProvinceCode: address.state,
          postalCode: address.postalCode,
          countryCode: address.country,
        },
      },
      readyDateTimestamp,
      customerCloseTime,
      ...pick(data, ORIGIN_DETAIL_PASSTHROUGH),
    },
    // A count is the only thing FedEx takes about the packages themselves;
    // an explicit `packageCount` on the index signature wins via the spread.
    packageCount: data.packages?.length,
    // 60-character limit on the FedEx side; passed through unmodified so an
    // over-long note fails loudly there rather than being silently cut.
    remarks: data.instructions ?? undefined,
    ...pick(data, TOP_LEVEL_PASSTHROUGH),
  }
}

/**
 * Build the body of `PUT /pickup/v1/pickups/cancel`.
 *
 * FedEx cancels by confirmation code *plus* operating company and dispatch
 * date, and an Express pickup also needs the `location` station its
 * creation returned — `carrierCode` alone decides which. `PickupCancelParams`
 * only carries these on its index signature, hence the explicit check.
 */
export function buildCancelPickupBody(
  id: string,
  data: PickupCancelParams | undefined,
  configAccountNumber: string | undefined,
): Record<string, unknown> {
  const params: PickupCancelParams = data ?? {}
  const missing: string[] = []

  const carrierCode = stringParam(params, 'carrierCode')
  if (!carrierCode) missing.push('carrierCode')

  const accountNumber = stringParam(params, 'accountNumber') ?? configAccountNumber
  if (!accountNumber) missing.push('accountNumber')

  const scheduledDate = stringParam(params, 'scheduledDate')
  if (!scheduledDate) missing.push('scheduledDate')

  // "Required only for FedEx Express Pickups. Optional for FedEx Ground."
  const location = stringParam(params, 'location')
  if (carrierCode === 'FDXE' && !location) missing.push('location')

  if (missing.length > 0) {
    throw new Error(`fedex: cancelPickup requires ${describeMissing(missing, CANCEL_HINTS)}`)
  }

  return {
    associatedAccountNumber: { value: accountNumber },
    pickupConfirmationCode: id,
    carrierCode,
    scheduledDate,
    location,
    remarks: params.reason ?? undefined,
  }
}

// ─── internal helpers ───────────────────────────────────────────────────────

/** A non-empty string at `key` on the index signature, else undefined. */
function stringParam(params: Record<string, unknown>, key: string): string | undefined {
  const v = params[key]
  return typeof v === 'string' && v !== '' ? v : undefined
}

function isDate(v: unknown): v is Date {
  return v instanceof Date && !isNaN(v.getTime())
}

function pick(params: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const k of keys) {
    if (params[k] !== undefined) out[k] = params[k]
  }
  return out
}

function describeMissing(keys: string[], hints: Record<string, string>): string {
  return keys.map((k) => `${k} (${hints[k]})`).join(', ')
}

/**
 * Wall-clock parts of an instant in an IANA zone. `hourCycle: 'h23'` keeps
 * midnight as `00`, which `hour12: false` alone does not on every ICU build.
 */
function wallClock(d: Date, timeZone: string): Record<string, string> {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(d)
  } catch (err) {
    if (err instanceof RangeError) throw new Error(`fedex: unknown timeZone "${timeZone}"`, { cause: err })
    throw err
  }
  const out: Record<string, string> = {}
  for (const p of parts) out[p.type] = p.value
  return out
}

/** `YYYY-MM-DDTHH:MM:SS` local to `timeZone`, no designator — the FedEx `readyDateTimestamp` format. */
function localTimestamp(d: Date, timeZone: string): string {
  const w = wallClock(d, timeZone)
  return `${w.year}-${w.month}-${w.day}T${w.hour}:${w.minute}:${w.second}`
}

/** `HH:MM:SS` local to `timeZone` — the FedEx `customerCloseTime` format. */
function localTime(d: Date, timeZone: string): string {
  const w = wallClock(d, timeZone)
  return `${w.hour}:${w.minute}:${w.second}`
}
