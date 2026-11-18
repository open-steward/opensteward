import type { Contact } from '../../../schema'
import { emailOrUndef, many2oneId, meta, strOrUndef, type Many2one } from '../values'

/**
 * A `res.partner` row — Helpdesk's customers: a ticket's `partner_id` is a
 * res.partner. Fields from odoo/addons/base/models/res_partner.py (14.0 and
 * 19.0):
 *   name = fields.Char(index=True, …)
 *   email = fields.Char()
 *   phone = fields.Char()
 *   is_company = fields.Boolean(string='Is a Company', default=False, …)
 *   commercial_partner_id = fields.Many2one('res.partner', compute='_compute_commercial_partner', …)
 * PII-minimal by the canonical schema: name, email and phone only.
 */
export interface RawOdooPartner {
  id: number
  name?: string | false
  email?: string | false
  phone?: string | false
  is_company?: boolean
  commercial_partner_id?: Many2one
  [key: string]: unknown
}

export const CONTACT_FIELDS = [
  'id',
  'name',
  'email',
  'phone',
  'is_company',
  'commercial_partner_id',
]

export function transformContact(raw: RawOdooPartner): Contact {
  // A person or company on its own is its own commercial entity
  // (_compute_commercial_partner); only a different partner is an organisation.
  const commercial = many2oneId(raw.commercial_partner_id)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: emailOrUndef(raw.email),
    name: strOrUndef(raw.name) ?? '',
    phone: strOrUndef(raw.phone),
    organizationId: commercial && commercial !== String(raw.id) ? commercial : undefined,
    platform: 'odoo-helpdesk',
    metadata: meta({
      isCompany: typeof raw.is_company === 'boolean' ? String(raw.is_company) : undefined,
    }),
    raw,
  }
}
