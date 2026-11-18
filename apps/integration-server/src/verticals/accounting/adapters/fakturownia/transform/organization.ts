/**
 * Fakturownia ↔ canonical Organization transform.
 *
 * Company information is retrieved from the /account.json endpoint on the
 * tenant's own subdomain (https://{account}.fakturownia.pl/account.json).
 *
 * Key fields returned:
 *   prefix (subdomain), name, tax_no, email, phone, www,
 *   address, city, post_code, country, currency
 *
 * Docs: https://github.com/fakturownia/api
 */
import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'

// ── Raw Fakturownia type ──────────────────────────────────────────────────────

export interface FakturowniaAccount {
  prefix?: string          // subdomain / account slug
  name?: string
  tax_no?: string
  email?: string
  phone?: string
  www?: string
  address?: string
  city?: string
  post_code?: string
  country?: string
  currency?: string
  timezone?: string
  [key: string]: unknown
}

// ── Forward transform ─────────────────────────────────────────────────────────

export function transformOrganization(raw: FakturowniaAccount): Organization {
  return {
    id: raw.prefix || undefined,
    name: raw.name || undefined,
    legalName: raw.name || undefined,
    taxNumber: raw.tax_no || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    website: raw.www || undefined,
    address: toAddress({
      address1: raw.address,
      city: raw.city,
      postalCode: raw.post_code,
      country: raw.country,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
