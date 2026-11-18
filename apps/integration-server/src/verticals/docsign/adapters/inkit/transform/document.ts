import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap, toIso } from './shared'

/**
 * Inkit document (a generated-document record). Inkit is a document-
 * generation platform, so a "document" is the rendered output of a
 * template + merge parameters, scoped to the render that produced it.
 *
 * Maps to the canonical Document — metadata only. Inkit never exposes the
 * file body on these records (the binary is fetched through a separate
 * download endpoint that this adapter intentionally does not implement),
 * so no content can leak.
 *
 * Shape per GET /document and GET /document/{documentId}.
 */
export interface RawInkitDocument {
  id?: string
  name?: string
  description?: string | null
  status?: string
  render_id?: string | null
  folder_id?: string | null
  template_id?: string
  page_count?: number
  size_bytes?: number
  expire_at?: string | null
  expire_after_n_views?: number | null
  created_by?: {
    id?: string
    name?: string
    first_name?: string
    last_name?: string
    email?: string
  }
  created_at?: string
  modified_at?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawInkitDocument,
  envelopeId: string,
  order: number,
): Document {
  const id = pickStr(raw.id) ?? `${envelopeId}:${order}`
  return {
    id,
    externalId: id,
    envelopeId,
    name: pickStr(raw.name) ?? `document-${order}`,
    sizeBytes: pickNum(raw.size_bytes),
    pageCount: pickNum(raw.page_count),
    mimeType: 'application/pdf',
    order,
    platform: 'inkit',
    metadata: strMap({
      status: raw.status,
      description: raw.description,
      renderId: raw.render_id,
      folderId: raw.folder_id,
      templateId: raw.template_id,
      expireAt: toIso(raw.expire_at),
      expireAfterNViews: raw.expire_after_n_views,
      createdBy: raw.created_by?.name,
      createdAt: toIso(raw.created_at),
      modifiedAt: toIso(raw.modified_at),
    }),
    raw,
  }
}
