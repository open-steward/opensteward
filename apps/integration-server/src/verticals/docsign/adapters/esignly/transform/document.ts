import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * eSignly document file metadata. Content is never surfaced — only the
 * filename, size, and page count. eSignly returns documents inline on a
 * sign request under the `documents` array.
 */
export interface RawEsignlyDocument {
  document_id?: string
  doc_id?: string
  name?: string
  file_name?: string
  mime_type?: string
  content_type?: string
  size?: string | number
  file_size?: string | number
  page_count?: string | number
  pages?: string | number
  order?: string | number
  [key: string]: unknown
}

export function transformDocument(
  raw: RawEsignlyDocument,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.document_id) ?? pickStr(raw.doc_id) ?? String(index)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.name) ?? pickStr(raw.file_name) ?? '',
    sizeBytes: pickNum(raw.size ?? raw.file_size),
    pageCount: pickNum(raw.page_count ?? raw.pages),
    mimeType: pickStr(raw.mime_type) ?? pickStr(raw.content_type) ?? 'application/pdf',
    order: pickNum(raw.order) ?? index,
    platform: 'esignly',
    metadata: strMap({ fileName: raw.file_name }),
    raw,
  }
}
