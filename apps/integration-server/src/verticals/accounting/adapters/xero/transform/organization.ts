import type { Organization } from '../../../schema/organization'
import { toUtcDate } from '../../shared/transform'

export interface XeroOrganisation {
  Name: string
  LegalName: string
  TaxNumber: string
  BaseCurrency: string
  CountryCode: string
  OrganisationID: string
  Website: string
  /** Xero's last-modified instant. A real moment, not a calendar date. */
  UpdatedDateUTC?: string
  [key: string]: unknown
}

export function transformOrganization(raw: XeroOrganisation): Organization {
  return {
    name: raw.Name || undefined,
    legalName: raw.LegalName || undefined,
    taxNumber: raw.TaxNumber || undefined,
    currency: raw.BaseCurrency || undefined,
    website: raw.Website || undefined,
    address: raw.CountryCode ? { country: raw.CountryCode } : undefined,
    // A genuine instant, so NOT routed through toCalendarDate. This is the
    // value `updated_after` filters on, and truncating it to a date would
    // reopen the incremental-sync gap it exists to close.
    updatedAt: toUtcDate(raw.UpdatedDateUTC),
    metadata: raw as Record<string, unknown>,
  }
}
