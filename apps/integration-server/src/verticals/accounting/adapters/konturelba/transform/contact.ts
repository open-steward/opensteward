import type { Contact } from '../../../schema/contact'

export interface KonturelbaContact {
  id?: string
  name?: string
  email?: string
  phone?: string
  inn?: string
  city?: string
  country?: string
  street?: string
  [key: string]: unknown
}

export function transformContact(raw: KonturelbaContact): Contact {
  return {
    id: raw.id ? String(raw.id) : '',
    name: raw.name || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    taxNumber: raw.inn || undefined,
    billingAddress: (raw.city || raw.country || raw.street) ? {
      address1: raw.street || undefined,
      city: raw.city || undefined,
      country: raw.country || undefined,
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
