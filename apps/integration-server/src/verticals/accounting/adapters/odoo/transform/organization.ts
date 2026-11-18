import type { Organization } from '../../../schema/organization'
import { toIso3166Alpha2 } from '../../../../shared/iso-normalise'

export interface OdooCompany {
  id?: number
  name?: string
  vat?: string
  currency_id?: [number, string]
  street?: string
  city?: string
  state_id?: [number, string]
  zip?: string
  // `country_id[1]` is the many2one `display_name`, translated to the
  // calling session's language ('Frankreich', 'Deutschland', ... on a
  // German-locale session) — not usable as a country code on its own.
  // `res.company` gained a locale-independent `country_code` field (Char,
  // related `country_id.code`, `depends=['country_id']`) in Odoo 18.0
  // (odoo/addons/base/models/res_company.py:66; also present in 19.0/master
  // at :80) — confirmed directly against Odoo's source per version, not
  // assumed. It does NOT exist on 17.0 and earlier (checked 15.0/16.0/17.0
  // directly: no such field), so self-hosted instances on those versions
  // genuinely won't send it. Prefer country_code when present; fall back to
  // normalising the (locale-dependent) tuple for older instances.
  country_id?: [number, string]
  country_code?: string
  [key: string]: unknown
}

export function transformOrganization(raw: OdooCompany): Organization {
  return {
    id: raw.id !== undefined ? String(raw.id) : undefined,
    name: raw.name || undefined,
    taxNumber: raw.vat || undefined,
    currency: raw.currency_id?.[1] || undefined,
    address:
      raw.street || raw.city || raw.country_id
        ? {
            address1: raw.street || undefined,
            city: raw.city || undefined,
            region: raw.state_id?.[1] || undefined,
            postalCode: raw.zip || undefined,
            country: toIso3166Alpha2(raw.country_code) ?? toIso3166Alpha2(raw.country_id?.[1]),
          }
        : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
