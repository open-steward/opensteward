/**
 * Octopus → canonical Organization transform.
 *
 * Octopus REST API endpoint: GET /dossier  (returns the active dossier info)
 *
 * The dossier is the top-level company/accounting file in Octopus.  Every
 * dossier corresponds to a single legal entity and holds all accounting data.
 */

import type { Organization } from '../../../schema/organization'

export interface OctopusDossier {
  dossierId?: number
  dossierName?: string
  companyName?: string
  vatNumber?: string
  enterpriseNumber?: string
  currency?: string
  address?: string
  address2?: string
  city?: string
  postalCode?: string
  country?: string
  countryCode?: string
  email?: string
  phone?: string
  website?: string
  fiscalYearEndDay?: number
  fiscalYearEndMonth?: number
  timezone?: string
  [key: string]: unknown
}

export function transformOrganization(raw: OctopusDossier): Organization {
  const name = raw.companyName || raw.dossierName
  return {
    id: raw.dossierId !== undefined ? String(raw.dossierId) : undefined,
    name: name || undefined,
    legalName: name || undefined,
    taxNumber: raw.vatNumber || raw.enterpriseNumber || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    fiscalYearEndMonth: raw.fiscalYearEndMonth,
    address: {
      address1: raw.address || undefined,
      address2: raw.address2 || undefined,
      city: raw.city || undefined,
      postalCode: raw.postalCode || undefined,
      country: raw.countryCode || raw.country || undefined,
    },
    metadata: raw as Record<string, unknown>,
  }
}
