/**
 * Invoice Ninja v5 company settings → canonical Organization.
 *
 * Endpoint: GET /api/v1/companies  (returns the authenticated company record)
 *
 * The company object is nested inside the response from GET /api/v1/companies
 * or can be obtained from the user's account settings.
 */

import type { Organization } from '../../../schema/organization'
import { toAddress } from '../../shared/transform'
import { currencyIdToIso } from '../constants'

export interface InvoiceNinjaCompanySettings {
  id: string
  name?: string | null
  id_number?: string | null
  vat_number?: string | null
  address1?: string | null
  address2?: string | null
  city?: string | null
  state?: string | null
  postal_code?: string | null
  country_id?: string | null
  phone?: string | null
  email?: string | null
  website?: string | null
  currency_id?: string | null
  [key: string]: unknown
}

export interface InvoiceNinjaCompany {
  id: string
  settings?: InvoiceNinjaCompanySettings | null
  [key: string]: unknown
}

const EMPTY_SETTINGS: InvoiceNinjaCompanySettings = { id: '' }

export function transformOrganization(raw: InvoiceNinjaCompany): Organization {
  const s: InvoiceNinjaCompanySettings = raw.settings ?? EMPTY_SETTINGS
  const name = s.name || undefined
  return {
    name,
    legalName: name,
    taxNumber: s.vat_number || s.id_number || undefined,
    currency: currencyIdToIso(s.currency_id),
    website: s.website || undefined,
    address: toAddress({
      address1: s.address1,
      address2: s.address2,
      city: s.city,
      region: s.state,
      postalCode: s.postal_code,
      country: s.country_id ? String(s.country_id) : undefined,
    }),
    metadata: raw as Record<string, unknown>,
  }
}
