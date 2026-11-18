import type { Pickup, PickupStatus } from '../../../schema/pickup'
import type { Weight } from '../../../schema/shared'
import type { PickupRequestParams } from '../../../adapter/interface'
import { nonempty } from '../../shared/transform'
import { UPS_PICKUP_STATUS_MAP } from '../constants'

// ── Response shapes (Pickup API v2409) ──────────────────────────────────────

export interface UPSResponseStatus {
  Code?: string // 1 = Success, 0 = failed
  Description?: string
}

export interface UPSPickupResponseContainer {
  ResponseStatus?: UPSResponseStatus
  Alert?: Array<{ Code?: string; Description?: string }>
  TransactionReference?: { CustomerContext?: string; TransactionIdentifier?: string }
  [key: string]: unknown
}

/** `PickupCreationResponse` — the unwrapped body of POST /pickupcreation/{v}/pickup. */
export interface UPSPickupCreationResponse {
  Response?: UPSPickupResponseContainer
  /**
   * Pickup Request Number, 11 chars. Only issued when a pickup was actually
   * scheduled; UPS returns the same PRN again for a duplicate request at the
   * same address and pickup point.
   */
  PRN?: string
  RateStatus?: { Code?: string; Description?: string }
  [key: string]: unknown
}

export interface UPSPickupCreationResponseWrapper {
  PickupCreationResponse: UPSPickupCreationResponse
}

/** `PickupCancelResponse` — the unwrapped body of DELETE /shipments/{v}/pickup/02. */
export interface UPSPickupCancelResponse {
  Response?: UPSPickupResponseContainer
  PickupType?: string // 01 = On-Call Pickup
  /** Smart Pickup only — absent on an on-call cancel. */
  GWNStatus?: { Code?: string; Description?: string }
  [key: string]: unknown
}

export interface UPSPickupCancelResponseWrapper {
  PickupCancelResponse: UPSPickupCancelResponse
}

// ── Response → canonical ────────────────────────────────────────────────────

export function mapPickupStatus(code: string | undefined): PickupStatus {
  if (!code) return 'unknown'
  return UPS_PICKUP_STATUS_MAP[code] ?? 'unknown'
}

function isSuccess(response: UPSPickupResponseContainer | undefined): boolean {
  return response?.ResponseStatus?.Code === '1'
}

/**
 * UPS confirms a scheduled pickup with a PRN and nothing else about it — no
 * status field, no echo of the address or window — so the record is the PRN
 * plus a status read off `ResponseStatus`. A 200 without a PRN is not a
 * pickup, and `id` is required, so that is an error rather than a record.
 */
export function transformPickupCreation(raw: UPSPickupCreationResponse): Pickup {
  const prn = raw.PRN
  if (!prn) {
    const code = raw.Response?.ResponseStatus?.Code ?? 'absent'
    throw new Error(`ups: pickup creation returned no PRN (ResponseStatus.Code=${code})`)
  }

  return {
    id: prn,
    confirmationNumber: prn,
    carrierId: 'UPS',
    status: isSuccess(raw.Response) ? 'SCHEDULED' : 'unknown',
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * The cancel response does not repeat the PRN, so the caller passes the one
 * it cancelled. A Smart Pickup cancel carries a `GWNStatus` describing the
 * pickup's actual state (it may already be completed, in which case the
 * cancel changed nothing) and that wins over the bare success flag.
 */
export function transformPickupCancel(raw: UPSPickupCancelResponse, prn: string): Pickup {
  return {
    id: prn,
    confirmationNumber: prn,
    carrierId: 'UPS',
    status: cancelStatus(raw),
    metadata: raw as Record<string, unknown>,
  }
}

function cancelStatus(raw: UPSPickupCancelResponse): PickupStatus {
  if (raw.GWNStatus?.Code) return mapPickupStatus(raw.GWNStatus.Code)
  return isSuccess(raw.Response) ? 'CANCELLED' : 'unknown'
}

// ── Canonical → PickupCreationRequest ───────────────────────────────────────

export interface UPSPickupCreationRequest {
  Request: Record<string, never>
  RatePickupIndicator: 'N'
  Shipper?: { Account: { AccountNumber: string; AccountCountryCode: string } }
  PickupDateInfo: { PickupDate: string; ReadyTime: string; CloseTime: string }
  PickupAddress: {
    CompanyName: string
    ContactName: string
    AddressLine: string
    City: string
    StateProvince?: string
    PostalCode?: string
    CountryCode: string
    ResidentialIndicator: 'Y' | 'N'
    Phone: { Number: string }
  }
  AlternateAddressIndicator: 'Y' | 'N'
  PickupPiece: Array<{
    ServiceCode: string
    Quantity: string
    DestinationCountryCode: string
    ContainerCode: string
  }>
  TotalWeight?: { Weight: string; UnitOfMeasurement: 'LBS' | 'KGS' }
  OverweightIndicator?: 'Y' | 'N'
  TrackingData?: Array<{ TrackingNumber: string }>
  PaymentMethod: string
  SpecialInstruction?: string
  ReferenceNumber?: string
}

export interface UPSPickupRequestDefaults {
  /** Shipper account from adapter config; `params.accountNumber` overrides it per call. */
  accountNumber?: string
}

/**
 * Build the `PickupCreationRequest` body for an on-call pickup.
 *
 * UPS requires more than the canonical params name, and none of it has a
 * safe default, so the missing pieces are reported together in one error:
 *
 * - `closeAt` — `CloseTime` is mandatory alongside `ReadyTime`.
 * - `serviceCode` (index signature) — a 3-digit Pickup API service code such
 *   as `'003'` (Ground); these are not the 2-digit Shipping API codes. One
 *   code covers every piece.
 * - `packages` — `PickupPiece.Quantity` is the package count.
 * - `address.street1/city/country/phone` and a `name` or `company`.
 * - `paymentMethod` (index signature) unless an account number is known, in
 *   which case `01` (bill shipper account) is selected and `Shipper.Account`
 *   is filled from it.
 *
 * Optional index-signature keys: `accountNumber`, `accountCountryCode`
 * (defaults to the pickup country), `destinationCountryCode` (defaults to the
 * pickup country — domestic, UPS's own ServiceCategory default),
 * `containerCode` (`01` package, `02` letter, `03` pallet), `residential`,
 * `alternateAddress`, `reference`, `timeZone`.
 *
 * `readyAt` / `closeAt` are instants; UPS wants the location's local date and
 * wall-clock times. `timeZone` (IANA) converts them; without it the instant is
 * read as UTC, the mirror of what `parseUPSDateTime` does with UPS's own
 * zone-less timestamps.
 */
export function toPickupCreationRequest(
  params: PickupRequestParams,
  defaults: UPSPickupRequestDefaults = {},
): UPSPickupCreationRequest {
  const { address, packages } = params
  const missing: string[] = []
  const req = <T>(value: T | undefined | null, key: string): T => {
    if (value === undefined || value === null || value === '') missing.push(key)
    return value as T
  }

  const street1 = req(address.street1, 'address.street1')
  const city = req(address.city, 'address.city')
  const country = req(address.country, 'address.country')
  const phone = req(address.phone, 'address.phone')
  const contact = req(address.name ?? address.company, 'address.name or address.company')
  const closeAt = req(params.closeAt, 'closeAt')
  const serviceCode = req(str(params.serviceCode), 'serviceCode')
  const pieces = req(nonempty(packages), 'packages')

  const accountNumber = str(params.accountNumber) ?? defaults.accountNumber
  const paymentMethod = req(
    str(params.paymentMethod) ?? (accountNumber ? '01' : undefined),
    'paymentMethod (or an accountNumber, which selects 01 = bill shipper account)',
  )
  if (paymentMethod === '01' && !accountNumber) {
    missing.push('accountNumber (PaymentMethod 01 bills the shipper account)')
  }

  if (missing.length > 0) {
    throw new Error(
      `ups: createPickup requires ${missing.join(', ')} — UPS PickupCreationRequest has no default for them`,
    )
  }

  const timeZone = str(params.timeZone)
  const ready = localParts(params.readyAt, timeZone)
  const close = localParts(closeAt, timeZone)
  const weights = pieces.every((p) => p.weight) ? pieces.map((p) => p.weight as Weight) : undefined

  return {
    Request: {},
    RatePickupIndicator: 'N',
    Shipper: accountNumber
      ? {
          Account: {
            AccountNumber: accountNumber,
            AccountCountryCode: str(params.accountCountryCode) ?? country,
          },
        }
      : undefined,
    PickupDateInfo: {
      PickupDate: ready.date,
      ReadyTime: ready.time,
      CloseTime: close.time,
    },
    PickupAddress: {
      CompanyName: address.company ?? contact,
      ContactName: contact,
      // The Pickup API takes a single line (its own sample sends a string, not
      // the Shipping API's array), so a unit / suite is folded into it.
      AddressLine: address.street2 ? `${street1}, ${address.street2}` : street1,
      City: city,
      StateProvince: address.state,
      PostalCode: address.postalCode,
      CountryCode: country,
      // UPS's own default is commercial.
      ResidentialIndicator: params.residential === true ? 'Y' : 'N',
      Phone: { Number: phone },
    },
    // The caller chose this address; we make no claim it matches the account
    // profile, which is what N would assert.
    AlternateAddressIndicator: params.alternateAddress === false ? 'N' : 'Y',
    PickupPiece: [
      {
        ServiceCode: serviceCode,
        Quantity: String(pieces.length),
        DestinationCountryCode: str(params.destinationCountryCode) ?? country,
        ContainerCode: str(params.containerCode) ?? '01',
      },
    ],
    TotalWeight: weights ? totalWeight(weights) : undefined,
    OverweightIndicator: weights ? (weights.some((w) => toLb(w) > 70) ? 'Y' : 'N') : undefined,
    TrackingData: nonempty(params.shipmentIds)?.map((n) => ({ TrackingNumber: n })),
    PaymentMethod: paymentMethod,
    SpecialInstruction: params.instructions,
    ReferenceNumber: str(params.reference),
  }
}

/**
 * Local `yyyyMMdd` and `HHmm` of an instant in `timeZone` (UTC when absent).
 * `hourCycle: 'h23'` keeps midnight at `00`, which `hour12: false` does not
 * on every ICU build.
 */
function localParts(date: Date, timeZone: string | undefined): { date: string; time: string } {
  let parts: Intl.DateTimeFormatPart[]
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? 'UTC',
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(date)
  } catch {
    throw new Error(`ups: createPickup timeZone "${timeZone}" is not a valid IANA time zone`)
  }
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? ''
  return {
    date: `${get('year')}${get('month')}${get('day')}`,
    time: `${get('hour')}${get('minute')}`,
  }
}

const LB_PER: Record<Weight['unit'], number> = { oz: 1 / 16, lb: 1, g: 1 / 453.592, kg: 2.20462 }
const KG_PER: Record<Weight['unit'], number> = { oz: 0.0283495, lb: 0.453592, g: 0.001, kg: 1 }

function toLb(w: Weight): number {
  return w.value * LB_PER[w.unit]
}

/**
 * Sum in KGS when every package is metric, else LBS. UPS allows one decimal.
 */
function totalWeight(weights: Weight[]): { Weight: string; UnitOfMeasurement: 'LBS' | 'KGS' } {
  const metric = weights.every((w) => w.unit === 'kg' || w.unit === 'g')
  const factor = metric ? KG_PER : LB_PER
  const total = weights.reduce((sum, w) => sum + w.value * factor[w.unit], 0)
  return { Weight: total.toFixed(1), UnitOfMeasurement: metric ? 'KGS' : 'LBS' }
}

/** Index-signature values are `unknown`; only a non-empty string is usable. */
function str(val: unknown): string | undefined {
  return typeof val === 'string' && val !== '' ? val : undefined
}
