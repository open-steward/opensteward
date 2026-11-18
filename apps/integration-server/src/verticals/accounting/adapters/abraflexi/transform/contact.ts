import type { Contact } from '../../../schema/contact'

export interface AbraflexiContact {
  id: string | number
  nazev?: string
  ic?: string
  email?: string
  telefon?: string
  ulice?: string
  mesto?: string
  stat?: string
  psc?: string
  [key: string]: unknown
}

export function transformContact(raw: AbraflexiContact): Contact {
  return {
    id: String(raw.id),
    name: raw.nazev || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.telefon ? [{ telephone: raw.telefon, type: 'WORK' }] : undefined,
    taxNumber: raw.ic || undefined,
    billingAddress: (raw.mesto || raw.stat || raw.ulice) ? {
      address1: raw.ulice || undefined,
      city: raw.mesto || undefined,
      postalCode: raw.psc || undefined,
      country: raw.stat || undefined,
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
