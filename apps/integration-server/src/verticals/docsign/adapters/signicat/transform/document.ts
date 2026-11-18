import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * Document metadata for a signing session. Signicat references documents on
 * a session by `documentId` (within a `documentCollectionId`), with an
 * optional `description` and the requested `action` (SIGN / VIEW). The
 * binary `GET /documents/{id}` endpoint is intentionally NOT called — the
 * canonical Document carries no content field, so the adapter only surfaces
 * metadata.
 */
export interface RawSignicatDocumentRef {
  documentId?: string
  documentCollectionId?: string
  action?: string
  description?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawSignicatDocumentRef,
  envelopeId: string,
  order: number,
): Document {
  const documentId = pickStr(raw.documentId) ?? `${envelopeId}:${order}`
  return {
    id: documentId,
    externalId: documentId,
    envelopeId,
    name: pickStr(raw.description) ?? documentId,
    sizeBytes: undefined,
    pageCount: undefined,
    // Signicat signs PDFs (PAdES); document-collection items are PDF.
    mimeType: 'application/pdf',
    order,
    platform: 'signicat',
    metadata: strMap({
      action: raw.action,
      documentCollectionId: raw.documentCollectionId,
    }),
    raw,
  }
}
