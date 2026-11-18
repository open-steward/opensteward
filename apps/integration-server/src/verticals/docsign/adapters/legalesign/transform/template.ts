import type { Template } from '../../../schema/template'
import { idFromUri, pickNum, pickStr, strMap, toIso } from './shared'

/**
 * Legalesign has two template kinds:
 *   - text/html templates  (`/template/`,    TemplateResponse)
 *   - PDF templates        (`/templatepdf/`, TemplatePdfResponse)
 * Both share `uuid`, `title`, `created`, `modified`, `group`, `user`. PDF
 * templates additionally carry `parties` (a JSON-stringified role array),
 * `page_count`, `signer_count`, and `valid`; text templates carry
 * `signee_count` and `has_fields`. This transform accepts either shape.
 */
export interface RawLegalesignTemplate {
  uuid: string
  resource_uri?: string
  title?: string
  created?: string
  modified?: string
  group?: string
  user?: string
  // text template
  signee_count?: number
  has_fields?: boolean
  archive?: boolean
  // pdf template
  parties?: string
  page_count?: number
  signer_count?: number
  valid?: boolean
  [key: string]: unknown
}

/** PDF templates expose roles as a JSON-stringified array in `parties`. */
function parseParties(parties: string | undefined): string[] {
  if (!parties) return []
  try {
    const arr = JSON.parse(parties)
    if (Array.isArray(arr)) return arr.map((p) => String(p)).filter((p) => p.length > 0)
  } catch {
    return []
  }
  return []
}

export function transformTemplate(raw: RawLegalesignTemplate): Template {
  const roles = parseParties(raw.parties)
  const signerCount = pickNum(raw.signer_count) ?? pickNum(raw.signee_count) ?? 0
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    name: pickStr(raw.title) ?? '',
    signerRoles: roles,
    // Legalesign templates compose a single document; PDF templates report a
    // page count rather than a document count, so we report 1 when the
    // template exists.
    documentCount: 1,
    createdAt: toIso(raw.created),
    updatedAt: toIso(raw.modified),
    platform: 'legalesign',
    metadata: strMap({
      group: idFromUri(raw.group),
      user: idFromUri(raw.user),
      signerCount,
      pageCount: raw.page_count,
      hasFields: raw.has_fields,
      valid: raw.valid,
      archive: raw.archive,
    }),
    raw,
  }
}
