import type { Pickup } from '../../../schema/pickup'
import type { Address, Package, Weight, Dimensions } from '../../../schema/shared'
import type { PickupRequestParams } from '../../../adapter/interface'

// ─── Response ────────────────────────────────────────────────────────────────

/**
 * `POST /pickups` 201 body (supermodelIoLogisticsExpressPickupResponse).
 * There is no status field and no echo of the booking — the dispatch
 * confirmation number is the whole record. It is plural because DHL may
 * consolidate one request into several dispatches.
 */
export interface DHLPickupResponse {
  dispatchConfirmationNumbers: string[]
  readyByTime?: string | null // "12:00" — HH:MM, no offset
  nextPickupDate?: string | null // "2020-06-01"
  warnings?: string[] | null
  [key: string]: unknown
}

/**
 * DHL echoes `nextPickupDate` + `readyByTime` without an offset. The adapter
 * books in `GMT+00:00` (see toDHLPickupDateTime), so the echo is read back in
 * that same clock — tagged explicitly, so the instant does not depend on the
 * host's TZ the way a bare `new Date('2020-06-01T12:00')` would.
 */
function readyAt(
  date: string | null | undefined,
  time: string | null | undefined,
): Date | undefined {
  if (!date || !time) return undefined
  const hhmmss = /^\d{2}:\d{2}$/.test(time) ? `${time}:00` : time
  const d = new Date(`${date}T${hhmmss}Z`)
  return isNaN(d.getTime()) ? undefined : d
}

export function transformPickup(raw: DHLPickupResponse): Pickup {
  const number = raw.dispatchConfirmationNumbers?.[0]
  if (!number) {
    throw new Error('dhl: pickup booking returned no dispatchConfirmationNumber')
  }
  return {
    id: number,
    confirmationNumber: number,
    carrierId: 'dhl',
    // A 201 carrying a dispatch confirmation number is a booked pickup. DHL
    // reports no status field to map; the only other state it ever tells us
    // about is the cancel below.
    status: 'SCHEDULED',
    readyAt: readyAt(raw.nextPickupDate, raw.readyByTime),
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * `DELETE /pickups/{dispatchConfirmationNumber}` answers 200 with no body, and
 * MyDHL API has no read endpoint to re-fetch a booking from, so the cancelled
 * record is built from the one fact the call established.
 */
export function cancelledPickup(dispatchConfirmationNumber: string): Pickup {
  return {
    id: dispatchConfirmationNumber,
    confirmationNumber: dispatchConfirmationNumber,
    carrierId: 'dhl',
    status: 'CANCELLED',
  }
}

// ─── Request ─────────────────────────────────────────────────────────────────

export interface DHLPartyDetails {
  postalAddress: {
    addressLine1: string | undefined
    addressLine2: string | undefined
    cityName: string | undefined
    provinceCode: string | undefined
    postalCode: string | undefined
    countryCode: string | undefined
  }
  contactInformation: {
    fullName: string | undefined
    companyName: string | undefined
    phone: string | undefined
    email: string | undefined
  }
}

/**
 * Canonical Address → DHL `{ postalAddress, contactInformation }`, the shape
 * shipperDetails / receiverDetails / pickupDetails all share. DHL requires a
 * companyName even for a private shipper, so it falls back to the contact
 * name — the reading createShipment has always made.
 */
export function toDHLPartyDetails(address: Address): DHLPartyDetails {
  return {
    postalAddress: {
      addressLine1: address.street1,
      addressLine2: address.street2,
      cityName: address.city,
      provinceCode: address.state,
      postalCode: address.postalCode,
      countryCode: address.country,
    },
    contactInformation: {
      fullName: address.name,
      companyName: address.company ?? address.name,
      phone: address.phone,
      email: address.email,
    },
  }
}

/**
 * `plannedPickupDateAndTime` wants `YYYY-MM-DDTHH:MM:SS GMT+HH:MM` (≤ 29
 * chars). A canonical Date is an instant with no zone of its own, so it is
 * written in UTC with the offset spelled out — the same instant, and
 * unambiguous where a bare local time would not be.
 */
export function toDHLPickupDateTime(d: Date): string {
  return `${d.toISOString().slice(0, 19)} GMT+00:00`
}

/** `closeTime` is HH:MM in the same clock as plannedPickupDateAndTime. */
export function toDHLCloseTime(d: Date): string {
  return d.toISOString().slice(11, 16)
}

export type DHLUnitOfMeasurement = 'metric' | 'imperial'

export interface DHLPickupPackage {
  weight: number
  dimensions?: { length: number; width: number; height: number }
}

const KG_PER: Record<Weight['unit'], number> = {
  kg: 1,
  g: 0.001,
  lb: 0.45359237,
  oz: 0.028349523125,
}
const CM_PER: Record<Dimensions['unit'], number> = { cm: 1, in: 2.54 }
const LB_PER_KG = 1 / KG_PER.lb
const IN_PER_CM = 1 / CM_PER.in

/** DHL's `multipleOf: 0.001`. */
const round3 = (n: number): number => Math.round(n * 1000) / 1000

/**
 * DHL takes one `unitOfMeasurement` per shipment — kg/cm or lb/in — and a
 * weight on every package. The system follows the first package's weight
 * unit; every other value is converted into it rather than relabelled.
 */
export function toDHLPickupPackages(packages: Package[]): {
  unitOfMeasurement: DHLUnitOfMeasurement
  packages: DHLPickupPackage[]
} {
  const first = packages[0]?.weight?.unit
  const system: DHLUnitOfMeasurement = first === 'lb' || first === 'oz' ? 'imperial' : 'metric'
  const weight = (w: Weight): number => {
    const kg = w.value * KG_PER[w.unit]
    return round3(system === 'metric' ? kg : kg * LB_PER_KG)
  }
  const length = (n: number, unit: Dimensions['unit']): number => {
    const cm = n * CM_PER[unit]
    return round3(system === 'metric' ? cm : cm * IN_PER_CM)
  }
  return {
    unitOfMeasurement: system,
    packages: packages.map((pkg, i) => {
      if (!pkg.weight) {
        throw new Error(`dhl: packages[${i}].weight is required to book a pickup`)
      }
      const dims = pkg.dimensions
      return {
        weight: weight(pkg.weight),
        dimensions: dims
          ? {
              length: length(dims.length, dims.unit),
              width: length(dims.width, dims.unit),
              height: length(dims.height, dims.unit),
            }
          : undefined,
      }
    }),
  }
}

/**
 * `shipmentDetails[]` — the shipments the courier will collect, each needing
 * a product code, a customs flag, a unit system and at least one weighed
 * package. The single-shipment case is assembled from the canonical fields
 * (`serviceCode` → productCode, `packages`, `shipmentIds[0]`). A caller with
 * several shipments passes DHL's own `shipmentDetails[]` through verbatim,
 * since flat `packages` cannot be allocated across `shipmentIds`.
 */
export function toDHLShipmentDetails(
  params: PickupRequestParams,
  accountNumber: string,
): unknown[] {
  if (Array.isArray(params.shipmentDetails)) return params.shipmentDetails
  const serviceCode = params.serviceCode
  if (typeof serviceCode !== 'string' || !serviceCode) {
    throw new Error(
      'dhl: serviceCode (the DHL product code, e.g. "P") is required to book a pickup',
    )
  }
  if (!params.packages?.length) {
    throw new Error('dhl: at least one package is required to book a pickup')
  }
  if ((params.shipmentIds?.length ?? 0) > 1) {
    throw new Error(
      'dhl: a pickup covering several shipmentIds needs DHL `shipmentDetails[]` on the request body',
    )
  }
  return [
    {
      productCode: serviceCode,
      accounts: [{ typeCode: 'shipper', number: accountNumber }],
      // Non-dutiable unless the caller says otherwise — the default
      // createShipment already makes for this account.
      isCustomsDeclarable: params.isCustomsDeclarable === true,
      shipmentTrackingNumber: params.shipmentIds?.[0],
      ...toDHLPickupPackages(params.packages),
    },
  ]
}
