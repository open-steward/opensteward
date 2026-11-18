import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * eversign attaches a `files` array to each document(envelope). Each file
 * is one canonical `Document`. eversign's "single-document-per-envelope"
 * pattern still surfaces multi-file uploads via this array.
 */
export interface RawEversignFile {
  name?: string
  file_id?: string | number
  file_url?: string
  file_size?: string | number
  size?: string | number
  pages?: number | string
  pageCount?: number | string
  mime_type?: string
  contentType?: string
  order?: number | string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawEversignFile,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.file_id) ?? String(index)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.name) ?? '',
    sizeBytes: pickNum(raw.file_size ?? raw.size),
    pageCount: pickNum(raw.pageCount ?? raw.pages),
    mimeType: pickStr(raw.mime_type ?? raw.contentType),
    order: pickNum(raw.order) ?? index,
    platform: 'eversign',
    // file_url is intentionally NOT projected — the canonical schema has
    // no url field. eversign's signed URL would leak content; we drop it
    // at the transform boundary.
    metadata: strMap({}),
    raw,
  }
}
