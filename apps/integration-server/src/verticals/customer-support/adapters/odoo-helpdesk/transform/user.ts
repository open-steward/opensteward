import type { User } from '../../../schema'
import { emailOrUndef, meta, strOrUndef } from '../values'

/**
 * A `res.users` row — Helpdesk agents are Odoo's internal users. Fields from
 * odoo/addons/base/models/res_users.py (14.0 and 19.0):
 *   login = fields.Char(required=True, help="Used to log into the system")
 *   active = fields.Boolean(default=True)
 *   share = fields.Boolean(…, string='Share User', store=True,
 *     help="External user with limited access, created only for the purpose of sharing data.")
 *   name = fields.Char(related='partner_id.name', inherited=True, …)
 *   email = fields.Char(related='partner_id.email', inherited=True, …)
 * `share` users are portal (customer) users, so agents are `share = false`.
 * `login` is not surfaced (it is often an address and the schema is PII-minimal).
 */
export interface RawOdooUser {
  id: number
  name?: string | false
  email?: string | false
  share?: boolean
  active?: boolean
  [key: string]: unknown
}

export const USER_FIELDS = ['id', 'name', 'email', 'share', 'active']

export function transformUser(raw: RawOdooUser): User {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    email: emailOrUndef(raw.email),
    name: strOrUndef(raw.name) ?? '',
    // Helpdesk team membership is not in any public Odoo source this adapter
    // was built from, so it is not read.
    teamIds: [],
    platform: 'odoo-helpdesk',
    metadata: meta({
      active: typeof raw.active === 'boolean' ? String(raw.active) : undefined,
    }),
    raw,
  }
}
