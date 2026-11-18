/**
 * Transform E2open partner/supplier records into canonical Supplier.
 *
 * E2open models trading partners (suppliers / manufacturers) through the
 * Zyme Partner Directory and CDM partner reference data.
 *
 * Partner fields (from Partner Register / Partner Search APIs):
 *   zymeId           — e2open internal partner identifier
 *   businessName     — legal/trading name
 *   businessPhone    — primary phone
 *   website          — company website
 *   email            — contact email (TrueID data if subscribed)
 *   isoCountryCode   — country
 *   status           — "Active" / "Inactive"
 *   currencyCode     — default transaction currency
 *   leadTimeDays     — typical lead-time in days
 *   partnerCode      — client's own cross-reference code for this partner
 */
import type { Supplier } from '../../../schema/supplier'
import {pickStr, pickNum, strMap} from './shared'

export interface RawE2openSupplier {
  zymeId?: string
  partnerCode?: string
  businessName?: string
  businessPhone?: string
  website?: string
  email?: string
  isoCountryCode?: string
  status?: string
  currencyCode?: string
  leadTimeDays?: number | string
  [key: string]: unknown
}

export function transformSupplier(raw: RawE2openSupplier): Supplier {
  const id = pickStr(raw.zymeId) ?? pickStr(raw.partnerCode) ?? ''

  return {
    id,
    externalId:          id,
    name:                pickStr(raw.businessName) ?? '',
    email:               pickStr(raw.email),
    phone:               pickStr(raw.businessPhone),
    defaultCurrency:     pickStr(raw.currencyCode),
    defaultLeadTimeDays: pickNum(raw.leadTimeDays),
    isActive:            (raw.status ?? '').toLowerCase() !== 'inactive',
    platform:            'e2open',
    metadata:            strMap({
      partnerCode:    raw.partnerCode,
      website:        raw.website,
      isoCountryCode: raw.isoCountryCode,
      status:         raw.status,
    }),
    raw,
  }
}
