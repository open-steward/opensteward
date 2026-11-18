import type { Template } from '../../../schema/template'
import { pickStr, strMap, toIso } from './shared'

/**
 * pdfFiller template (a stored fillable document). `fillable_fields` is the
 * field manifest; pdfFiller templates do not expose named signer roles, so
 * `signerRoles` stays empty.
 */
export interface RawPdffillerTemplate {
  id?: number | string
  name?: string
  type?: string
  created?: string
  folder?: number | string
  fillable_fields?: Array<{ name?: string }>
  pages_count?: number | string
  [key: string]: unknown
}

export function transformTemplate(raw: RawPdffillerTemplate): Template {
  const id = pickStr(raw.id) ?? ''
  return {
    id,
    externalId: id,
    name: pickStr(raw.name) ?? '',
    signerRoles: [],
    documentCount: 1,
    createdAt: toIso(raw.created),
    platform: 'pdffiller',
    metadata: strMap({
      type: raw.type,
      folder: raw.folder,
      pagesCount: raw.pages_count,
      fillableFieldCount: Array.isArray(raw.fillable_fields)
        ? raw.fillable_fields.length
        : undefined,
    }),
    raw,
  }
}
