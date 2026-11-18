import type { Customer } from '../../../schema/customer'
import { strMap, fullName } from './shared'

/** FastSpring account contact block. */
export interface RawFastspringContact {
  first?: string | null
  last?: string | null
  email?: string | null
  company?: string | null
  phone?: string | null
  subscribed?: boolean
}

/** FastSpring account — the platform's customer record. */
export interface RawFastspringAccount {
  id?: string
  account?: string
  contact?: RawFastspringContact | null
  language?: string | null
  country?: string | null
  lookup?: { global?: string; custom?: string } | null
  url?: string | null
  [k: string]: unknown
}

/**
 * FastSpring accounts carry no settlement currency on the account itself and
 * no created/updated timestamps in the REST representation, so those
 * canonical fields are left undefined (missing-rather-than-wrong).
 */
export function transformCustomer(raw: RawFastspringAccount): Customer {
  const c = raw.contact ?? {}
  const id = String(raw.id ?? raw.account ?? '')
  return {
    id,
    externalId: id,
    email: c.email ?? undefined,
    name: fullName(c.first, c.last),
    phone: c.phone ?? undefined,
    gateway: 'fastspring',
    metadata: strMap({
      company: c.company,
      country: raw.country,
      language: raw.language,
      lookupGlobal: raw.lookup?.global,
      lookupCustom: raw.lookup?.custom,
      url: raw.url,
    }),
    raw,
  }
}
