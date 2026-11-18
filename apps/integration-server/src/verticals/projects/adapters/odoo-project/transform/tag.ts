import type { Tag } from '../../../schema/tag'
import { meta, strOrUndef } from '../values'

/**
 * A `project.tags` row (addons/project/models/project_tags.py, 19.0):
 *   _name = 'project.tags'  """ Tags of project's tasks """
 *   name = fields.Char('Name', required=True, translate=True)
 *   color = fields.Integer(string='Color', default=_get_default_color, …)
 *     where _get_default_color returns randint(1, 11)
 *   _name_uniq = models.Constraint('unique (name)', …)
 * The same two fields in 14.0 (addons/project/models/project.py).
 *
 * Tags belong to no company or project: one set per database, so a tag has no
 * workspace. `color` is an index into Odoo's palette, not a colour value, so
 * it goes to metadata and the canonical `color` is left out.
 */
export interface RawOdooTag {
  id: number
  name?: string | false
  color?: number | false
}

export const TAG_FIELDS = ['id', 'name', 'color']

export function transformTag(raw: RawOdooTag): Tag {
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    workspaceId: '',
    name: strOrUndef(raw.name) ?? '',
    platform: 'odoo-project',
    metadata: meta({
      colorIndex: typeof raw.color === 'number' ? String(raw.color) : undefined,
    }),
    raw,
  }
}
