import type { Contact } from '../../../schema/contact'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface SberbusinessContact {
  clientId?: string
  clientName?: string
  email?: string
  phone?: string
  inn?: string
  city?: string
  country?: string
  [key: string]: unknown
}

export function transformContact(raw: SberbusinessContact): Contact {
  return {
    id: raw.clientId ? String(raw.clientId) : '',
    name: raw.clientName || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    taxNumber: raw.inn || undefined,
    billingAddress: (raw.city || raw.country) ? {
      city: raw.city || undefined,
      country: toIso3166Alpha2(raw.country),
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
