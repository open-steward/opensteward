import type { Address } from '../../../schema/shared'

/**
 * ShippyPro address shape — used in both to_address / from_address fields.
 * Field names follow the camelCase convention ShippyPro applies in responses.
 */
export interface ShippyProAddress {
  Name?: string | null
  Company?: string | null
  Street1?: string | null
  Street2?: string | null
  City?: string | null
  State?: string | null
  Zip?: string | null
  Country?: string | null
  Phone?: string | null
  Email?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: ShippyProAddress): Address {
  return {
    name: raw.Name ?? undefined,
    company: raw.Company ?? undefined,
    street1: raw.Street1 ?? undefined,
    street2: raw.Street2 ?? undefined,
    city: raw.City ?? undefined,
    state: raw.State ?? undefined,
    postalCode: raw.Zip ?? undefined,
    country: raw.Country ?? undefined,
    phone: raw.Phone ?? undefined,
    email: raw.Email ?? undefined,
  }
}

/**
 * The documented v1 `Address` schema (https://api.shippypro.com/docs/v1.json,
 * `components.schemas.Address`): "A postal address (used for both sender and
 * recipient)." with lowercase `name`, `company`, `street1`, `street2`, `city`,
 * `state`, `zip`, `country` ("ISO 3166-1 alpha-2 country code."), `phone` and
 * `email`. `GetShipmentsReport` returns it as `to_address` / `from_address`.
 */
export interface ShippyProDocAddress {
  name?: string | null
  company?: string | null
  street1?: string | null
  street2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  [key: string]: unknown
}

/** An empty string (the documented example of an unset field) is absent. */
function text(v: string | null | undefined): string | undefined {
  return v === null || v === undefined || v.trim() === '' ? undefined : v
}

export function transformDocAddress(raw: ShippyProDocAddress): Address {
  const country = text(raw.country)
  return {
    name: text(raw.name),
    company: text(raw.company),
    street1: text(raw.street1),
    street2: text(raw.street2),
    city: text(raw.city),
    state: text(raw.state),
    postalCode: text(raw.zip),
    country: country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : undefined,
    phone: text(raw.phone),
    email: text(raw.email),
  }
}
