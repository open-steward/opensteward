import { z } from 'zod'
import type { Address } from '../../../schema/shared'

/**
 * An address resource in the `included` array of the Skydropx PRO shipment
 * responses (GET /api/v1/shipments, GET /api/v1/shipments/{id}), as the
 * first-party OpenAPI documents it (https://pro.skydropx.com/es-MX/api-docs.json):
 *
 *   area_level1  "Estado, provincia o departamento de la dirección"
 *   area_level2  "Ciudad o municipio de la dirección"
 *   area_level3  "Barrio o colonia de la dirección"
 *   postal_code  "Código postal de la dirección"
 *   country_code "Código de país de la dirección" (example "MX")
 *   street1      "Calle y número de la dirección"
 *   apartment_number "Número de departamento"
 */
export interface SkydropxAddress {
  id?: string
  type?: string
  attributes?: {
    id?: string | null
    area_level1?: string | null
    area_level2?: string | null
    area_level3?: string | null
    name?: string | null
    postal_code?: string | null
    country_code?: string | null
    address_type?: string | null
    street1?: string | null
    company?: string | null
    phone?: string | null
    email?: string | null
    reference?: string | null
    apartment_number?: string | null
    further_information?: string | null
    tax_id_number?: string | null
    tax_id_type?: string | null
  }
}

const EMAIL = z.email()

function text(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && v.trim() !== '' ? v : undefined
}

/** ISO 3166-1 alpha-2 only; anything else is omitted rather than guessed. */
function alpha2(v: string | null | undefined): string | undefined {
  return typeof v === 'string' && /^[A-Za-z]{2}$/.test(v) ? v.toUpperCase() : undefined
}

export function transformAddress(raw: SkydropxAddress): Address {
  const a = raw.attributes ?? {}
  const email = text(a.email)
  return {
    name: text(a.name),
    company: text(a.company),
    street1: text(a.street1),
    street2: text(a.apartment_number),
    city: text(a.area_level2),
    state: text(a.area_level1),
    postalCode: text(a.postal_code),
    country: alpha2(a.country_code),
    phone: text(a.phone),
    email: email && EMAIL.safeParse(email).success ? email : undefined,
  }
}
