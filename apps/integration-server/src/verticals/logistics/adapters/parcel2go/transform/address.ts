import type { Address } from '../../../schema/shared'

/**
 * Parcel2Go address fields.
 * Collection = origin, Delivery = destination.
 */
export interface Parcel2GoAddress {
  Name?: string | null
  Property?: string | null
  Street?: string | null
  Town?: string | null
  County?: string | null
  Postcode?: string | null
  Country?: string | null
  Email?: string | null
  Phone?: string | null
  [key: string]: unknown
}

export function transformAddress(raw: Parcel2GoAddress): Address {
  return {
    name: raw.Name ?? undefined,
    street1: raw.Property ?? raw.Street ?? undefined,
    street2: raw.Property && raw.Street ? raw.Street : undefined,
    city: raw.Town ?? undefined,
    state: raw.County ?? undefined,
    postalCode: raw.Postcode ?? undefined,
    country: raw.Country ?? undefined,
    phone: raw.Phone ?? undefined,
    email: raw.Email ?? undefined,
  }
}
