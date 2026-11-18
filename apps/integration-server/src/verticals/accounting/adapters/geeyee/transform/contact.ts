import type { Contact } from '../../../schema/contact'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface GeeyeeContact {
  id?: string
  name?: string
  email?: string
  phone?: string
  taxNo?: string
  city?: string
  country?: string
  [key: string]: unknown
}

export function transformContact(raw: GeeyeeContact): Contact {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    taxNumber: raw.taxNo || undefined,
    billingAddress: (raw.city || raw.country) ? {
      city: raw.city || undefined,
      country: toIso3166Alpha2(raw.country),
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
