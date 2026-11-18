import type { Customer } from '../../../schema/customer'
import { pickCurrency, strMap } from './shared'

export interface RawRecurlyAccount {
  id?: string
  code?: string
  email?: string
  first_name?: string
  last_name?: string
  company?: string
  preferred_locale?: string
  cc_emails?: string
  vat_number?: string
  currency?: string
  state?: string
  created_at?: string
  updated_at?: string
  [k: string]: unknown
}

export function transformCustomer(raw: RawRecurlyAccount): Customer {
  const name =
    [raw.first_name, raw.last_name].filter(Boolean).join(' ').trim() || raw.company || undefined
  return {
    id: String(raw.id ?? ''),
    externalId: String(raw.code ?? raw.id ?? ''),
    email: raw.email,
    name,
    description: raw.company,
    currency: raw.currency ? pickCurrency(raw.currency) : undefined,
    gateway: 'recurly',
    metadata: strMap({ vat_number: raw.vat_number, preferred_locale: raw.preferred_locale }),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    raw,
  }
}
