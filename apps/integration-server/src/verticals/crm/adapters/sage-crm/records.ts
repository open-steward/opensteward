/**
 * Helpers shared by the Sage CRM transforms. Every field read here is named in
 * the components.schemas of the 2024 R2 RESTful API reference
 * (https://developer.sage.com/crm/apis/crm/2024.02/crm-2024r2-rest-api-ref).
 */
import { Email, toIsoDatetime } from '@opensteward/shared'

/** Documented `integer/int32` record key, as a canonical string id. Throws when absent. */
export function requireKey(value: unknown, field: string): string {
  if (typeof value === 'number' && Number.isInteger(value)) return String(value)
  throw Object.assign(new Error(`Sage CRM record has no ${field}`), { statusCode: 502 })
}

/** Optional int32 foreign key. Sage CRM has no 0 key, but 0 is still a value it sent. */
export function optKey(value: unknown): string | undefined {
  return typeof value === 'number' && Number.isInteger(value) ? String(value) : undefined
}

export function optString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

export function optDate(value: unknown): string | undefined {
  return toIsoDatetime(value)
}

/** Email sub-record (components.schemas.Email). */
export interface RawSageCrmEmail {
  Emai_EmailId?: number
  Emai_EmailAddress?: string
  [key: string]: unknown
}

/** Phone sub-record (components.schemas.Phone). */
export interface RawSageCrmPhone {
  Phon_PhoneId?: number
  Phon_CountryCode?: string
  Phon_AreaCode?: string
  Phon_number?: string
  [key: string]: unknown
}

/** Address sub-record (components.schemas.Address). */
export interface RawSageCrmAddress {
  Addr_AddressId?: number
  addr_address1?: string
  addr_address2?: string
  Addr_City?: string
  Addr_State?: string
  Addr_PostCode?: string
  Addr_Country?: string
  [key: string]: unknown
}

/**
 * The record's email, when it has exactly one. The schema documents an
 * `Email` array with no primary flag and no primary-email id on the parent, so
 * with two or more there is no documented way to pick one; all of them stay in
 * `metadata`.
 */
export function soleEmail(emails: unknown): string | undefined {
  if (!Array.isArray(emails) || emails.length !== 1) return undefined
  const address = (emails[0] as RawSageCrmEmail).Emai_EmailAddress
  return Email.safeParse(address).success ? address : undefined
}

/**
 * The record's phone, when it has exactly one (same reason as `soleEmail`),
 * joined from the documented country code, area code and number.
 */
export function solePhone(phones: unknown): string | undefined {
  if (!Array.isArray(phones) || phones.length !== 1) return undefined
  const p = phones[0] as RawSageCrmPhone
  if (!optString(p.Phon_number)) return undefined
  return [p.Phon_CountryCode, p.Phon_AreaCode, p.Phon_number]
    .filter((part): part is string => typeof part === 'string' && part.trim() !== '')
    .join(' ')
}

/**
 * The address whose `Addr_AddressId` is the parent's documented
 * `*_PrimaryAddressId`. `Addr_Country` is omitted: its format is undocumented
 * and the canonical field is ISO 3166-1 alpha-2.
 */
export function primaryAddress(
  addresses: unknown,
  primaryId: unknown,
):
  | { line1?: string; line2?: string; city?: string; region?: string; postalCode?: string }
  | undefined {
  if (!Array.isArray(addresses) || typeof primaryId !== 'number') return undefined
  const a = (addresses as RawSageCrmAddress[]).find((x) => x.Addr_AddressId === primaryId)
  if (!a) return undefined
  return {
    line1: optString(a.addr_address1),
    line2: optString(a.addr_address2),
    city: optString(a.Addr_City),
    region: optString(a.Addr_State),
    postalCode: optString(a.Addr_PostCode),
  }
}
