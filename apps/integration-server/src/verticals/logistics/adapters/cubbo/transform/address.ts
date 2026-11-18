import { AddressSchema, type Address } from '../../../schema/shared'

/**
 * The `shipping` object of an order in Cubbo's GET /v1/orders response, as the
 * documented 200 example shows it (developers.cubbo.com, "Get Orders"):
 *
 *   "shipping": { "first_name": "edo", "last_name": "mon", "company": null,
 *     "phone": "5555555555", "address_1": "homero 100", "address_2": null,
 *     "email": "edo@cubbo.com", "zip_code": "11550", "country": "MX",
 *     "state": "cdmx", "city": "cdmx", "number": null, "neighborhood": null }
 */
export interface CubboAddress {
  first_name?: string | null
  last_name?: string | null
  company?: string | null
  phone?: string | null
  address_1?: string | null
  address_2?: string | null
  email?: string | null
  zip_code?: string | null
  country?: string | null
  state?: string | null
  city?: string | null
  number?: string | null
  neighborhood?: string | null
  [key: string]: unknown
}

const COUNTRY = AddressSchema.shape.country
const EMAIL = AddressSchema.shape.email

function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined
}

export function transformAddress(raw: CubboAddress): Address {
  const name = [text(raw.first_name), text(raw.last_name)].filter(Boolean).join(' ')
  // Cubbo's order-creation docs define country as "Country code (ISO alpha-2,
  // e.g., "MX")", and the documented order example carries "MX". A value that
  // is not an assigned alpha-2 code is left out rather than guessed at; the
  // same goes for an email the canonical schema would reject (the documented
  // example itself carries `"email": "a"`).
  const country = text(raw.country)
  const email = text(raw.email)
  return {
    name: name || undefined,
    company: text(raw.company),
    street1: text(raw.address_1),
    street2: text(raw.address_2),
    city: text(raw.city),
    state: text(raw.state),
    postalCode: text(raw.zip_code),
    country: country && COUNTRY.safeParse(country).success ? country : undefined,
    phone: text(raw.phone),
    email: email && EMAIL.safeParse(email).success ? email : undefined,
  }
}
