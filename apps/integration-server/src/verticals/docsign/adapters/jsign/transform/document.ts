import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * Shape of a document item returned inside
 * GET /api/v2/envelopes/{envelopeId}/details under `documents[]`.
 */
export interface RawJsignDocument {
  id?: string
  name?: string
  description?: string
  /** MIME type or file extension hint */
  type?: string
  /** Byte size of the document */
  size?: number | string
  /** Number of pages */
  pages?: number | Array<unknown>
  /** Reference number within the envelope (1-based) */
  document_ref_no?: number
  categories?: string[]
  [key: string]: unknown
}

export function transformDocument(raw: RawJsignDocument, envelopeId: string): Document {
  const id = pickStr(raw.id) ?? `${envelopeId}:${raw.document_ref_no ?? 0}`
  const pageCount = Array.isArray(raw.pages)
    ? raw.pages.length
    : pickNum(raw.pages)
  return {
    id,
    externalId: pickStr(raw.id) ?? `${raw.document_ref_no ?? 0}`,
    envelopeId,
    name: pickStr(raw.name) ?? '',
    sizeBytes: pickNum(raw.size),
    pageCount,
    mimeType: raw.type === 'pdf' ? 'application/pdf' : pickStr(raw.type),
    order: pickNum(raw.document_ref_no) ?? 0,
    platform: 'jsign',
    metadata: strMap({
      description: raw.description,
      categories: Array.isArray(raw.categories) ? raw.categories.join(',') : undefined,
    }),
    raw,
  }
}
