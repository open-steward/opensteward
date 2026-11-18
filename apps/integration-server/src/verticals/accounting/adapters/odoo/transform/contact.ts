import type { Contact } from '../../../schema/contact'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface OdooPartner {
  id?: number
  name?: string
  company_name?: string
  email?: string
  phone?: string
  mobile?: string
  vat?: string
  active?: boolean
  customer_rank?: number
  supplier_rank?: number
  street?: string
  city?: string
  zip?: string
  // `country_id[1]` is the many2one `display_name`, translated to the
  // calling user's session language ('Frankreich', 'Deutschland', ... on a
  // German-locale session) — not usable as a country code on its own.
  // `res.partner` separately exposes `country_code` (Char, related
  // `country_id.code`) as Odoo's own locale-independent field for exactly
  // this reason (confirmed in odoo/addons/base/models/res_partner.py).
  // Prefer it; fall back to normalising the (locale-dependent) tuple only
  // when it's absent.
  country_id?: [number, string]
  country_code?: string
  [key: string]: unknown
}

export function transformContact(raw: OdooPartner): Contact {
  const telephones = [
    ...(raw.phone ? [{ telephone: raw.phone, type: 'WORK' as const }] : []),
    ...(raw.mobile ? [{ telephone: raw.mobile, type: 'MOBILE' as const }] : []),
  ]
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    companyName: raw.company_name || undefined,
    taxNumber: raw.vat || undefined,
    isCustomer: (raw.customer_rank ?? 0) > 0,
    isSupplier: (raw.supplier_rank ?? 0) > 0,
    isActive: raw.active ?? true,
    emails: raw.email ? [{ email: raw.email }] : undefined,
    telephones: telephones.length > 0 ? telephones : undefined,
    billingAddress:
      raw.street || raw.city
        ? {
            address1: raw.street || undefined,
            city: raw.city || undefined,
            postalCode: raw.zip || undefined,
            country: toIso3166Alpha2(raw.country_code) ?? toIso3166Alpha2(raw.country_id?.[1]),
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
