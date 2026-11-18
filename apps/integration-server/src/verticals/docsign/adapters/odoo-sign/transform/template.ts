import type { Template } from '../../../schema/template'
import { idList, many2oneId, meta, odooIso, strOrUndef, type Many2one } from '../values'

/**
 * A `sign.template` row. Field names from Odoo's own published data and views
 * (github.com/odoo/industry):
 *   - name      the 19.0 list-view extension climbing_gym/data/ir_ui_view.xml
 *               inherits sign.sign_template_view_tree at `//field[@name='name']`,
 *               and tests/test_generic/tests/test_xml.py lists
 *               `'sign.template': ['name']`.
 *   - tag_ids   real_estate/data/ir_ui_view.xml (19.0) inherits
 *               sign.sign_template_view_form at `//field[@name='tag_ids']`;
 *               tattoo_shop sets it (sign.template.tag).
 *   - user_id   set on every template in <industry>/data/sign_template.xml (18.0, 19.0).
 *   - attachment_id  the template's one file on Odoo 18.0
 *               (18.0 <industry>/data/sign_template.xml). The 19.0 data sets
 *               it on sign.document instead (see document.ts). Industry has
 *               no Sign data before 18.0, so older versions are assumed to
 *               match 18.0; fields_get drops the field where they do not.
 * plus the automatic fields (see values.ts).
 */
export interface RawOdooSignTemplate {
  id: number
  display_name?: string | false
  name?: string | false
  user_id?: Many2one
  tag_ids?: number[] | false
  attachment_id?: Many2one
  create_date?: string | false
  write_date?: string | false
}

export const SIGN_TEMPLATE_FIELDS = [
  'id',
  'display_name',
  'name',
  'user_id',
  'tag_ids',
  'attachment_id',
  'create_date',
  'write_date',
]

export interface TemplateParts {
  /** Distinct sign.item.role names of the template's sign.item fields, in item id order. */
  signerRoles: string[]
  /** sign.document rows (19.0+), or 1 for an 18.0 template with an attachment_id. */
  documentCount: number
}

export function transformTemplate(raw: RawOdooSignTemplate, parts: TemplateParts): Template {
  const tags = idList(raw.tag_ids)
  return {
    id: String(raw.id),
    externalId: String(raw.id),
    name: strOrUndef(raw.name) ?? strOrUndef(raw.display_name) ?? '',
    signerRoles: parts.signerRoles,
    documentCount: parts.documentCount,
    createdAt: odooIso(raw.create_date),
    updatedAt: odooIso(raw.write_date),
    platform: 'odoo-sign',
    metadata: meta({
      userId: many2oneId(raw.user_id),
      tagIds: tags.length ? tags.join(',') : undefined,
    }),
    raw,
  }
}
