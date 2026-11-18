/**
 * CashCtrl organization settings → canonical Organization transform.
 *
 * Organization settings are retrieved via GET /setting/read.json.
 * The response is a flat object with company-level properties.
 *
 * Docs: https://app.cashctrl.com/static/help/en/api/index.html#setting
 */
import type { Organization } from '../../../schema/organization'

/**
 * CashCtrl setting record as returned by GET /setting/read.json.
 * Field names are based on the CashCtrl REST API documentation.
 */
export interface CashCtrlSettings {
  /** Company / organisation name. */
  name?: string | null
  /** Legal entity name (often the same as name). */
  legalName?: string | null
  /** UID / VAT registration number. */
  taxNumber?: string | null
  /** Default currency code (ISO 4217). */
  currencyCode?: string | null
  /** Company website URL. */
  website?: string | null
  /** Street address, line 1. */
  address?: string | null
  /** Postal code. */
  zip?: string | null
  /** City. */
  city?: string | null
  /** ISO 3166-1 alpha-2 country code. */
  country?: string | null
  [key: string]: unknown
}

export function transformOrganization(raw: CashCtrlSettings): Organization {
  const hasAddress = raw.address || raw.zip || raw.city || raw.country
  return {
    name: raw.name || undefined,
    legalName: raw.legalName || raw.name || undefined,
    taxNumber: raw.taxNumber || undefined,
    currency: raw.currencyCode || undefined,
    website: raw.website || undefined,
    address: hasAddress
      ? {
          address1: raw.address || undefined,
          city: raw.city || undefined,
          postalCode: raw.zip || undefined,
          country: raw.country || undefined,
        }
      : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
