import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

export interface RawSignPlusDocument {
  id?: string
  name?: string
  filename?: string
  page_count?: number
  pages?: Array<{ width?: number; height?: number }>
  [key: string]: unknown
}

/**
 * Sign.Plus does not expose document file size or MIME type, and documents are
 * not individually ordered on the envelope payload, so `order` is supplied by
 * the caller from the document's position in the list. Filenames imply PDF (the
 * signed-document download format), so we surface `application/pdf` when a
 * filename ends in `.pdf` and leave it undefined otherwise.
 */
export function transformDocument(
  raw: RawSignPlusDocument,
  envelopeId: string,
  order: number,
): Document {
  const filename = pickStr(raw.filename)
  const mimeType =
    filename && filename.toLowerCase().endsWith('.pdf') ? 'application/pdf' : undefined
  return {
    id: raw.id ?? `${envelopeId}:${order}`,
    externalId: raw.id ?? `${envelopeId}:${order}`,
    envelopeId,
    name: pickStr(raw.name) ?? filename ?? '',
    pageCount: pickNum(raw.page_count) ?? (Array.isArray(raw.pages) ? raw.pages.length : undefined),
    mimeType,
    order,
    platform: 'sign-plus',
    metadata: strMap({ filename: raw.filename }),
    raw,
  }
}
