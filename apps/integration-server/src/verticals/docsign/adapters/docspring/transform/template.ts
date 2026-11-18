/**
 * DocSpring template → canonical Template, from the spec's `template_preview`
 * definition (https://docspring.com/api-docs/v1/swagger.json), which is what
 * both `GET /templates` and `GET /templates/{template_id}` return:
 *   id, name, description, updated_at, document_filename: "x-nullable": true
 *   template_type: "enum": ["pdf", "html"]
 *   page_count: "type": "integer"
 */
import type { Template } from '../../../schema/template'
import { pickStr, requireStr, strMap, toIso } from './shared'

export interface RawDocSpringTemplate {
  id: string | null
  name: string | null
  description: string | null
  document_filename: string | null
  template_type: 'pdf' | 'html'
  page_count: number
  updated_at: string | null
  [key: string]: unknown
}

export function transformTemplate(raw: RawDocSpringTemplate): Template {
  const id = requireStr(raw.id, 'template id')
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    description: pickStr(raw.description),
    // template_preview documents no roles.
    signerRoles: [],
    // A template carries at most one source document: the singular
    // `document_filename` is null until one is uploaded (and on HTML templates).
    documentCount: raw.document_filename ? 1 : 0,
    updatedAt: toIso(raw.updated_at),
    platform: 'docspring',
    metadata: strMap({ templateType: raw.template_type, pageCount: raw.page_count }),
    raw,
  }
}
