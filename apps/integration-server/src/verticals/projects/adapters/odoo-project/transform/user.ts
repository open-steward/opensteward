import { z } from 'zod'
import type { User } from '../../../schema/user'
import { meta, strOrUndef, x2manyIds } from '../values'

/**
 * A `res.users` row (odoo/addons/base/models/res_users.py, 19.0 and 14.0):
 *   _inherits = {'res.partner': 'partner_id'}
 *   name = fields.Char(related='partner_id.name', inherited=True, readonly=False)
 *   email = fields.Char(related='partner_id.email', inherited=True, readonly=False)
 *   active = fields.Boolean(default=True)
 *   share = fields.Boolean(…, string='Share User', …,
 *     help="External user with limited access, created only for the purpose of sharing data.")
 *   company_ids = fields.Many2many('res.company', 'res_company_users_rel', 'user_id', 'cid', string='Companies', …)
 *
 * Only name and email reach the canonical user (the schema is PII-minimal);
 * `login` is not read. An email Odoo holds that is not a valid address is
 * left out rather than failing the row.
 */
export interface RawOdooUser {
  id: number
  name?: string | false
  email?: string | false
  active?: boolean
  share?: boolean
  company_ids?: number[]
}

export const USER_FIELDS = ['id', 'name', 'email', 'active', 'share', 'company_ids']

const Email = z.email()

export function transformUser(raw: RawOdooUser): User {
  const email = strOrUndef(raw.email)?.trim()
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    ...(email && Email.safeParse(email).success ? { email } : {}),
    name: strOrUndef(raw.name) ?? '',
    workspaceIds: x2manyIds(raw.company_ids),
    platform: 'odoo-project',
    metadata: meta({
      active: typeof raw.active === 'boolean' ? String(raw.active) : undefined,
      share: typeof raw.share === 'boolean' ? String(raw.share) : undefined,
    }),
    raw,
  }
}
