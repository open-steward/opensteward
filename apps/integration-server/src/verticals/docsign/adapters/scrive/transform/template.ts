import type { Template } from '../../../schema/template'
import { strMap, toIso } from './shared'
import { documentTitle, type RawScriveDocument } from './envelope'
import { documentFiles } from './document'

/**
 * Scrive templates are documents with `is_template: true` ("Only templates"
 * list filter `{"filter_by":"is_template"}` at https://apidocs.scrive.com/).
 */
export function transformTemplate(raw: RawScriveDocument): Template {
  return {
    id: raw.id,
    externalId: raw.id,
    name: documentTitle(raw),
    signerRoles: (raw.parties ?? [])
      .map((p) => p.signatory_role)
      .filter((r): r is string => typeof r === 'string'),
    documentCount: documentFiles(raw).length,
    createdAt: toIso(raw.ctime),
    updatedAt: toIso(raw.mtime),
    platform: 'scrive',
    metadata: strMap({}),
    raw,
  }
}
