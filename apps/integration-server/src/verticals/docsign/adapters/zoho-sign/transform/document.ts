import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * Zoho Sign carries documents inline on the request under `document_ids[]`.
 * Each entry has metadata only — we never request the binary content.
 */
export interface RawZohoSignDocumentEntry {
  document_id?: string
  document_name?: string
  document_size?: string | number
  total_pages?: string | number
  document_order?: string | number
  image_string?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawZohoSignDocumentEntry,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.document_id) ?? `${envelopeId}:${index}`
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.document_name) ?? '',
    sizeBytes: pickNum(raw.document_size),
    pageCount: pickNum(raw.total_pages),
    mimeType: 'application/pdf',
    order: pickNum(raw.document_order) ?? index,
    platform: 'zoho-sign',
    metadata: strMap({}),
    raw,
  }
}
