/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { Contact } from '../../../schema/contact'

export interface PohodaContact {
  id: string | number
  company?: string
  ico?: string
  email?: string
  phone?: string
  street?: string
  city?: string
  country?: string
  zip?: string
  [key: string]: unknown
}

export function transformContact(raw: PohodaContact): Contact {
  return {
    id: String(raw.id),
    name: raw.company || undefined,
    emails: raw.email ? [{ email: raw.email, type: 'WORK' }] : undefined,
    telephones: raw.phone ? [{ telephone: raw.phone, type: 'WORK' }] : undefined,
    taxNumber: raw.ico || undefined,
    billingAddress: (raw.city || raw.country || raw.street) ? {
      address1: raw.street || undefined,
      city: raw.city || undefined,
      postalCode: raw.zip || undefined,
      country: raw.country || undefined,
    } : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
