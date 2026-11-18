import type { Workspace } from '../../../schema/workspace'
import { many2oneId, meta, strOrUndef, type Many2one } from '../values'

/**
 * A `res.company` row (odoo/addons/base/models/res_company.py, 19.0 and 14.0):
 *   name = fields.Char(related='partner_id.name', string='Company Name', required=True, store=True, …)
 *   parent_id = fields.Many2one('res.company', string='Parent Company', …)
 *
 * Odoo has no workspace object. A company is the nearest: projects and tasks
 * carry `company_id`, and users carry `company_ids` (string='Companies'), so
 * the company is the workspace these ids point at.
 */
export interface RawOdooCompany {
  id: number
  name?: string | false
  parent_id?: Many2one
}

export const COMPANY_FIELDS = ['id', 'name', 'parent_id']

export function transformWorkspace(raw: RawOdooCompany): Workspace {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: strOrUndef(raw.name) ?? '',
    platform: 'odoo-project',
    metadata: meta({ parentCompanyId: many2oneId(raw.parent_id) }),
    raw,
  }
}
