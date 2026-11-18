/**
 * myBillBook → canonical Organization transform.
 *
 * myBillBook business profile fields (snake_case):
 *   id, business_name, legal_name, gstin, pan, email, phone,
 *   address, city, state, pincode, country, currency,
 *   financial_year_start (1-12), timezone, created_at, updated_at
 */

import type { Organization } from '../../../schema/organization'
import { toIsoDatetime } from '@opensteward/shared'

export interface MybillbookBusiness {
  id?: string
  business_name?: string
  legal_name?: string
  gstin?: string
  pan?: string
  email?: string
  phone?: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  country?: string
  currency?: string
  financial_year_start?: number
  timezone?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

export function transformOrganization(raw: MybillbookBusiness): Organization {
  return {
    id: raw.id || undefined,
    name: raw.business_name || undefined,
    legalName: raw.legal_name || raw.business_name || undefined,
    taxNumber: raw.gstin || undefined,
    currency: raw.currency || undefined,
    timezone: raw.timezone || undefined,
    // financial_year_start: myBillBook uses month number 1-12
    fiscalYearEndMonth: raw.financial_year_start
      ? ((raw.financial_year_start - 1 + 11) % 12) + 1
      : undefined,
    address: {
      address1: raw.address || undefined,
      city: raw.city || undefined,
      region: raw.state || undefined,
      postalCode: raw.pincode || undefined,
      country: raw.country || undefined,
    },
    createdAt: toIsoDatetime(raw.created_at) ? new Date(toIsoDatetime(raw.created_at)!) : undefined,
    updatedAt: toIsoDatetime(raw.updated_at) ? new Date(toIsoDatetime(raw.updated_at)!) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
