import type { Document } from '../../../schema/document'
import { strMap } from './shared'

/**
 * BreezeDoc file. Documents are stored as `document_files` nested on a
 * BreezeDoc document; there is no standalone file endpoint and the manifest
 * carries only an id and a page list (no filename, size, or mime on the
 * wire). We surface page count from `document_file_pages` and treat every
 * file as a PDF (BreezeDoc's only document format). Binary content is never
 * requested — the canonical Document has no content field.
 */
export interface RawBreezedocFile {
  id: number | string
  document_file_pages?: Array<unknown>
  [key: string]: unknown
}

export function transformDocument(
  raw: RawBreezedocFile,
  documentId: string,
  order: number,
  documentTitle?: string,
): Document {
  const externalId = String(raw.id)
  return {
    id: `${documentId}:${externalId}`,
    externalId,
    envelopeId: documentId,
    name: documentTitle ? `${documentTitle} (${order + 1})` : `document-${externalId}`,
    pageCount: Array.isArray(raw.document_file_pages) ? raw.document_file_pages.length : undefined,
    mimeType: 'application/pdf',
    order,
    platform: 'breezedoc',
    metadata: strMap({ fileId: externalId }),
    raw,
  }
}
