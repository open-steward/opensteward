/**
 * Octopus API field helpers shared by the Maximizer transforms.
 *
 * Field types from the first-party Octopus API Postman collection
 * (github.com/maximizercrm/octopus-api, "Field and Object Types"):
 *
 *   DateTimeField: "**Value** - A string value containing the date value of the
 *     field in ISO8601 format." The CreationDate example returns
 *     "2015-01-20T20:37:51Z"; a date user-defined field returns "2017-08-24",
 *     and the Note Create example sends "2018-04-20T11:12:13" with no zone.
 *   CurrencyField: "**Value** - A numeric value ... **CurrencyCode -** A string
 *     value containing the currency symbol or code for the field."
 */
import { Iso3166Alpha2, toIsoDatetime } from '@opensteward/shared'
import type { Address } from '../../schema/shared'

/**
 * An instant only when the value states its zone. Octopus returns some date
 * fields without an offset, and the docs do not say which zone those are in,
 * so they are left out rather than guessed.
 */
export function zonedIso(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  if (!/T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/.test(value.trim())) return undefined
  return toIsoDatetime(value)
}

export function str(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value : undefined
}

/** The record's `Key`, which every Read, Update and Delete takes. */
export function requireKey(raw: { Key?: unknown }, object: string): string {
  const key = str(raw.Key)
  if (!key) throw new Error(`Maximizer ${object} row has no Key`)
  return key
}

export interface RawOctopusAddress {
  AddressLine1?: string | null
  AddressLine2?: string | null
  City?: string | null
  StateProvince?: string | null
  ZipCode?: string | null
  Country?: string | null
  [key: string]: unknown
}

/**
 * The AbEntry `Address` object (AbEntry Read examples request AddressLine1,
 * AddressLine2, City, StateProvince, ZipCode, Country). `Country` is free text
 * in Maximizer, so it is kept only when it is already an ISO 3166 alpha-2 code.
 */
export function toAddress(raw: RawOctopusAddress | null | undefined): Address | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const country = str(raw.Country)
  const address: Address = {
    line1: str(raw.AddressLine1),
    line2: str(raw.AddressLine2),
    city: str(raw.City),
    region: str(raw.StateProvince),
    postalCode: str(raw.ZipCode),
    country: country && Iso3166Alpha2.safeParse(country).success ? country : undefined,
  }
  return Object.values(address).some((v) => v !== undefined) ? address : undefined
}
