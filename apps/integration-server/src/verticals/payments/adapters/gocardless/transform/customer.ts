import type { Customer } from '../../../schema/customer'
import { strMap } from './shared'

export interface RawGCCustomer {
  id?: string
  email?: string
  given_name?: string
  family_name?: string
  company_name?: string
  phone_number?: string
  country_code?: string
  language?: string
  address_line1?: string
  address_line2?: string
  city?: string
  region?: string
  postal_code?: string
  created_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawGCCustomer): Customer {
  const name =
    raw.company_name ??
    ([raw.given_name, raw.family_name].filter(Boolean).join(' ').trim() || undefined)
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.id ?? ''),
    email: raw.email,
    name,
    phone: raw.phone_number,
    billingAddress: raw.address_line1
      ? {
          line1: raw.address_line1,
          line2: raw.address_line2,
          city: raw.city,
          region: raw.region,
          postalCode: raw.postal_code,
          country: raw.country_code,
        }
      : undefined,
    gateway: 'gocardless',
    metadata: strMap({ language: raw.language }),
    createdAt: raw.created_at,
    raw,
  }
}
