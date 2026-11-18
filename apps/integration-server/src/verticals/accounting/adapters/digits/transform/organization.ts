/**
 * Digits company → canonical Organization
 *
 * Digits GET /company returns an object with company info:
 * - businessName, fiscalYearStartMonth, timezone, earliestTransactionDate
 * The API does not expose address or legalName directly.
 */
import type { Organization } from '../../../schema/organization'

export interface DigitsCompany {
  businessName?: string
  legalName?: string
  taxId?: string
  fiscalYearStartMonth?: number  // 1-12
  timezone?: string
  currency?: string
  website?: string
  earliestTransactionDate?: string
  [key: string]: unknown
}

export function transformOrganization(raw: DigitsCompany): Organization {
  return {
    name: raw.businessName || undefined,
    legalName: raw.legalName || undefined,
    taxNumber: raw.taxId || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.website || undefined,
    // Digits reports fiscal year as the start month (1=Jan); canonical wants end month.
    // Without knowing the duration, we leave fiscalYearEndMonth unset.
    metadata: raw as Record<string, unknown>,
  }
}
