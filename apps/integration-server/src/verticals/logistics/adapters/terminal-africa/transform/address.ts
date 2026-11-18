/**
 * Terminal Africa address object -> canonical Address.
 *
 * Fields per "The Address Object" (https://docs.terminal.africa/tship/address.md):
 * name ("Full name of person at address"), first_name, last_name, line1,
 * line2, city, state, zip, country ("ISO 2 country code for address. e.g.
 * NG"), phone, email. `user` (a USER-… account id) is not a name and there is
 * no company field. The shipment examples still carry alpha-3 codes ('NGA'),
 * so a country that is not an assigned alpha-2 code is left out.
 */
import { isIso3166Alpha2 } from '@opensteward/shared'
import type { Address } from '../../../schema/shared'

export interface TerminalAfricaAddress {
  address_id?: string | null
  id?: string | null
  first_name?: string | null
  last_name?: string | null
  name?: string | null
  user?: string | null
  line1?: string | null
  line2?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
  is_residential?: boolean | null
  coordinates?: { lat?: number; lng?: number } | null
  [key: string]: unknown
}

export function transformAddress(raw: TerminalAfricaAddress): Address {
  const joined = [raw.first_name, raw.last_name].filter(Boolean).join(' ')
  return {
    name: raw.name || joined || undefined,
    street1: raw.line1 || undefined,
    street2: raw.line2 || undefined,
    city: raw.city || undefined,
    state: raw.state || undefined,
    postalCode: raw.zip || undefined,
    country: raw.country && isIso3166Alpha2(raw.country) ? raw.country : undefined,
    phone: raw.phone || undefined,
    email: raw.email || undefined,
  }
}
