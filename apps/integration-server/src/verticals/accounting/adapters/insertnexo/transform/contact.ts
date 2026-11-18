/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact'

export interface InsertnexoContact {
  Id: string | number
  Nazwa?: string
  Email?: string
  Telefon?: string
  NIP?: string
  Ulica?: string
  Miasto?: string
  Kraj?: string
  KodPocztowy?: string
  [key: string]: unknown
}

export function transformContact(raw: InsertnexoContact): Contact {
  return {
    id: String(raw.Id),
    name: raw.Nazwa || undefined,
    emails: raw.Email ? [{ email: raw.Email, type: 'WORK' }] : undefined,
    telephones: raw.Telefon ? [{ telephone: raw.Telefon, type: 'WORK' }] : undefined,
    taxNumber: raw.NIP || undefined,
    billingAddress: (raw.Miasto || raw.Kraj || raw.Ulica) ? {
      address1: raw.Ulica || undefined,
      city: raw.Miasto || undefined,
      postalCode: raw.KodPocztowy || undefined,
      country: raw.Kraj || undefined,
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
