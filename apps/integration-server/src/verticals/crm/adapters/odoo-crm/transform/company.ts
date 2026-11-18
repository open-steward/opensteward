import { toIsoDatetime } from '@opensteward/shared'
import type { Company } from '../../../schema/company'
import { many2oneId, many2oneName, strOrUndef, type Many2one } from '../values'

/**
 * A `res.partner` row with `is_company = true`, as `search_read` returns it
 * for {@link COMPANY_FIELDS} (fields from odoo/addons/base/models/res_partner.py,
 * Odoo 19.0).
 */
export interface RawOdooCompany {
  id: number
  name?: string | false
  /** `fields.Char('Website Link')` */
  website?: string | false
  phone?: string | false
  /** `fields.Many2one('res.partner.industry', 'Industry')` */
  industry_id?: Many2one
  user_id?: Many2one
  create_date?: string | false
  write_date?: string | false
  [key: string]: unknown
}

export const COMPANY_FIELDS = [
  'id',
  'name',
  'website',
  'phone',
  'industry_id',
  'user_id',
  'create_date',
  'write_date',
]

/** `website` is a link; the canonical `domain` is its host name. */
function hostOf(website: string | undefined): string | undefined {
  if (!website) return undefined
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(website) ? website : `https://${website}`)
    return url.hostname || undefined
  } catch {
    return undefined
  }
}

export function transformCompany(raw: RawOdooCompany): Company {
  const name = strOrUndef(raw.name)
  if (!name) {
    // res_partner.py 19.0 requires `name` only for type 'contact' ("CHECK( (type='contact'
    // AND name IS NOT NULL) or (type!='contact') )"), and the company domain does not
    // filter on type. A nameless company row has no canonical name to give, so it throws.
    throw new Error(`Odoo res.partner ${raw.id} has no name`)
  }
  return {
    id: String(raw.id),
    name,
    domain: hostOf(strOrUndef(raw.website)),
    phone: strOrUndef(raw.phone),
    industry: many2oneName(raw.industry_id),
    owner_id: many2oneId(raw.user_id),
    created_at: toIsoDatetime(strOrUndef(raw.create_date)),
    updated_at: toIsoDatetime(strOrUndef(raw.write_date)),
    metadata: raw,
  }
}

export function untransformCompany(data: Partial<Company>): Record<string, unknown> {
  const out: Record<string, unknown> = { is_company: true }
  if (data.name !== undefined) out.name = data.name
  if (data.domain !== undefined) out.website = data.domain
  if (data.phone !== undefined) out.phone = data.phone
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  return out
}
