/**
 * iFirma organization / subscriber transform.
 *
 * iFirma does not expose a dedicated company-info endpoint via the public API.
 * The abonent (subscriber) key is used for account-management calls.
 * This module is provided as a placeholder; organization data is typically
 * populated from the subscriber profile stored in credentials.extra.
 */
import type { Organization } from '../../../schema/organization'

// ── Raw type ──────────────────────────────────────────────────────────────────

export interface IfirmaAbonent {
  /** User login / username */
  Login: string
  NazwaFirmy?: string
  NIP?: string
  Ulica?: string
  KodPocztowy?: string
  Miejscowosc?: string
  Email?: string
  Telefon?: string
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformOrganization(raw: IfirmaAbonent): Organization {
  return {
    id: raw.Login || undefined,
    name: raw.NazwaFirmy || raw.Login || undefined,
    legalName: raw.NazwaFirmy || undefined,
    taxNumber: raw.NIP || undefined,
    address: raw.Ulica || raw.Miejscowosc
      ? {
          address1: raw.Ulica || undefined,
          city: raw.Miejscowosc || undefined,
          postalCode: raw.KodPocztowy || undefined,
          country: 'PL',
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
