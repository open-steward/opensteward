/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact'

export interface ComarchoptimaContact {
  id: string | number
  kod?: string
  nazwa?: string
  email?: string
  telefon?: string
  nip?: string
  miasto?: string
  kraj?: string
  ulica?: string
  kod_pocztowy?: string
  [key: string]: unknown
}

export function transformContact(raw: ComarchoptimaContact): Contact {
  return {
    id: String(raw.id),
    name: raw.nazwa || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.telefon ? [{ telephone: raw.telefon, type: 'WORK' }] : undefined,
    taxNumber: raw.nip || undefined,
    billingAddress: (raw.miasto || raw.kraj || raw.ulica) ? {
      address1: raw.ulica || undefined,
      city: raw.miasto || undefined,
      postalCode: raw.kod_pocztowy || undefined,
      country: raw.kraj || undefined,
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
