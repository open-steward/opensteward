import type { Contact } from '../../../schema/contact'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface YonyouContact {
  id?: string
  name?: string
  email?: string
  tel?: string
  taxno?: string
  city?: string
  country?: string
  [key: string]: unknown
}

export function transformContact(raw: YonyouContact): Contact {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.tel ? [{ telephone: raw.tel, type: 'WORK' }] : undefined,
    taxNumber: raw.taxno || undefined,
    billingAddress: (raw.city || raw.country) ? {
      city: raw.city || undefined,
      country: toIso3166Alpha2(raw.country),
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
