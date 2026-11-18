import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * A file attached to a ZorroSign package. Metadata only — the canonical
 * Document schema has no content/url field, and the adapter never requests
 * the binary. snake_case on the wire.
 */
export interface RawZorrosignDocument {
  document_id: string
  name?: string
  file_name?: string
  mime_type?: string
  content_type?: string
  size?: string | number
  file_size?: string | number
  page_count?: string | number
  order?: string | number
  [key: string]: unknown
}

export function transformDocument(
  raw: RawZorrosignDocument,
  envelopeId: string,
  index: number,
): Document {
  const mime = pickStr(raw.mime_type ?? raw.content_type)
  return {
    id: `${envelopeId}:${raw.document_id}`,
    externalId: raw.document_id,
    envelopeId,
    name: pickStr(raw.name ?? raw.file_name) ?? '',
    sizeBytes: pickNum(raw.size ?? raw.file_size),
    pageCount: pickNum(raw.page_count),
    mimeType: mime,
    order: pickNum(raw.order) ?? index,
    platform: 'zorrosign',
    metadata: strMap({ contentType: mime }),
    raw,
  }
}
