import type { Project } from '../../../schema/project'
import type { ProjectStatus } from '../../../schema/shared'
import {
  htmlText,
  many2oneId,
  meta,
  odooIso,
  strOrUndef,
  x2manyIds,
  type Many2one,
} from '../values'

/**
 * A `project.project` row (addons/project/models/project_project.py, 19.0):
 *   name = fields.Char("Name", index='trigram', required=True, …)
 *   description = fields.Html(help="Description to provide more information and context about this project")
 *   active = fields.Boolean(default=True, …)
 *   partner_id = fields.Many2one('res.partner', string='Customer', …)
 *   company_id = fields.Many2one('res.company', string='Company', …)
 *   user_id = fields.Many2one('res.users', string='Project Manager', …)
 *   date_start = fields.Date(string='Start Date', copy=False)
 *   date = fields.Date(string='Expiration Date', …, help="Date on which this project ends. …")
 *   tag_ids = fields.Many2many('project.tags', relation='project_project_project_tags_rel', string='Tags')
 *   privacy_visibility = fields.Selection([('followers', …), ('invited_users', …),
 *     ('employees', …), ('portal', …)], string='Visibility', …)
 *   last_update_status = fields.Selection(selection=[('on_track', 'On Track'),
 *     ('at_risk', 'At Risk'), ('off_track', 'Off Track'), ('on_hold', 'On Hold'),
 *     ('to_define', 'Set Status'), ('done', 'Complete')], …)
 * plus the log-access columns create_date / write_date.
 *
 * Older versions (odoo/odoo 14.0–18.0 addons/project/models/project.py, then
 * project_project.py from 17.0): `tag_ids` is new in 15.0; `last_update_status`
 * is new in 15.0 (on_track / at_risk / off_track / on_hold), gains `to_define`
 * in 16.0 and `done` in 17.0; `company_id` is `required=True` up to 16.0 and
 * optional from 17.0. A field the server lacks is absent from the row.
 */
export interface RawOdooProject {
  id: number
  name?: string | false
  description?: string | false
  active?: boolean
  partner_id?: Many2one
  company_id?: Many2one
  user_id?: Many2one
  date_start?: string | false
  date?: string | false
  tag_ids?: number[]
  privacy_visibility?: string | false
  last_update_status?: string | false
  create_date?: string | false
  write_date?: string | false
}

export const PROJECT_FIELDS = [
  'id',
  'name',
  'description',
  'active',
  'partner_id',
  'company_id',
  'user_id',
  'date_start',
  'date',
  'tag_ids',
  'privacy_visibility',
  'last_update_status',
  'create_date',
  'write_date',
]

/**
 * An archived project (`active` false) is archived whatever its status. Of the
 * status-update values, only 'on_hold' ("On Hold") and 'done' ("Complete" in
 * 19.0, "Done" in 17.0–18.0) name a canonical state; on_track / at_risk /
 * off_track / to_define are all a running project.
 */
function projectStatus(raw: RawOdooProject): ProjectStatus {
  if (raw.active === false) return 'archived'
  if (raw.last_update_status === 'on_hold') return 'on_hold'
  if (raw.last_update_status === 'done') return 'completed'
  return 'active'
}

export function transformProject(raw: RawOdooProject): Project {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    // res.company is this adapter's workspace; a 17.0+ project may have none.
    workspaceId: many2oneId(raw.company_id) ?? '',
    name: strOrUndef(raw.name) ?? '',
    description: htmlText(raw.description),
    status: projectStatus(raw),
    ownerId: many2oneId(raw.user_id),
    startDate: odooIso(raw.date_start),
    endDate: odooIso(raw.date),
    createdAt: odooIso(raw.create_date),
    updatedAt: odooIso(raw.write_date),
    platform: 'odoo-project',
    metadata: meta({
      customerId: many2oneId(raw.partner_id),
      lastUpdateStatus: strOrUndef(raw.last_update_status),
      privacyVisibility: strOrUndef(raw.privacy_visibility),
      tagIds: raw.tag_ids && raw.tag_ids.length ? x2manyIds(raw.tag_ids).join(',') : undefined,
    }),
    raw,
  }
}
