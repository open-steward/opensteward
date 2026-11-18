import type { Template } from '../../../schema/template'
import { epochToIso, pickStr, strMap } from './shared'
import type { RawSignNowDocument } from './envelope'

/**
 * SignNow templates are flagged on the same document record (is_template,
 * template, template_name). The transform projects those records into the
 * canonical Template shape.
 */
export function transformTemplate(raw: RawSignNowDocument): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: pickStr(raw.template_name) ?? pickStr(raw.document_name) ?? '',
    signerRoles: (raw.field_invites ?? [])
      .map((i) => i.role)
      .filter((r): r is string => typeof r === 'string'),
    documentCount: 1,
    createdAt: epochToIso(raw.created),
    updatedAt: epochToIso(raw.updated),
    platform: 'signnow',
    metadata: strMap({}),
    raw,
  }
}
