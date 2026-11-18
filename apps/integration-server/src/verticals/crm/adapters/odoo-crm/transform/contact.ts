import { toIsoDatetime } from '@opensteward/shared'
import type { Contact } from '../../../schema/contact'
import { many2oneId, strOrUndef, type Many2one } from '../values'

/**
 * A `res.partner` row as `search_read` returns it for {@link CONTACT_FIELDS}.
 * Fields are those declared on `res.partner` in Odoo 19.0
 * (odoo/addons/base/models/res_partner.py) plus the log-access columns
 * `create_date` / `write_date` ("Stores when the record was created /
 * last updated, Datetime" — ORM reference). Empty values come back as `false`.
 */
export interface RawOdooContact {
  id: number
  name?: string | false
  email?: string | false
  phone?: string | false
  /** `fields.Char(string='Job Position')` */
  function?: string | false
  /** The partner's commercial entity: itself, or the company it belongs to. */
  commercial_partner_id?: Many2one
  /** `user_id` — Salesperson (`res.users`). */
  user_id?: Many2one
  create_date?: string | false
  write_date?: string | false
  [key: string]: unknown
}

export const CONTACT_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'function',
  'commercial_partner_id',
  'user_id',
  'create_date',
  'write_date',
]

export function transformContact(raw: RawOdooContact): Contact {
  // A standalone person is its own commercial entity; only a different
  // partner is a company the contact belongs to.
  const commercial = many2oneId(raw.commercial_partner_id)
  const companyId = commercial && commercial !== String(raw.id) ? commercial : undefined

  return {
    id: String(raw.id),
    name: strOrUndef(raw.name),
    email: strOrUndef(raw.email),
    phone: strOrUndef(raw.phone),
    title: strOrUndef(raw.function),
    company_id: companyId,
    owner_id: many2oneId(raw.user_id),
    created_at: toIsoDatetime(strOrUndef(raw.create_date)),
    updated_at: toIsoDatetime(strOrUndef(raw.write_date)),
    metadata: raw,
  }
}

export function untransformContact(data: Partial<Contact>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: 'contact', is_company: false }
  if (data.first_name !== undefined || data.last_name !== undefined) {
    out.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
  } else if (data.name !== undefined) {
    out.name = data.name
  }
  if (data.email !== undefined) out.email = data.email
  if (data.phone !== undefined) out.phone = data.phone
  if (data.title !== undefined) out.function = data.title
  if (data.company_id !== undefined) out.commercial_partner_id = Number(data.company_id)
  if (data.owner_id !== undefined) out.user_id = Number(data.owner_id)
  return out
}
