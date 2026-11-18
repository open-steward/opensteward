import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * `DocumentCountResponseDTO` from the WeSign v3 OpenAPI
 * (https://wse.comsigntrust.com/api/swagger/v3/swagger.json), the body of
 * `GET /v3/DocumentCollections/{id}/documents/{documentId}/pages`
 * ("Get pages count by document id"). Metadata only: the canonical Document
 * has no content field, and no file-bearing endpoint is called.
 */
export interface RawWeSignDocumentCount {
  documentId?: string
  templateId?: string
  documentName?: string | null
  pagesCount?: number
}

/** Canonical id of a WeSign document: documents are read through their collection. */
export function documentId(collectionId: string, id: string): string {
  return `${collectionId}:${id}`
}

export function transformDocument(
  raw: RawWeSignDocumentCount,
  envelopeId: string,
  order: number,
): Document {
  const externalId = pickStr(raw.documentId)
  if (!externalId) throw new Error(`WeSign document on collection ${envelopeId} has no documentId`)
  return {
    id: documentId(envelopeId, externalId),
    externalId,
    envelopeId,
    // `documentName` is nullable in the spec; an unnamed document has no name to show.
    name: pickStr(raw.documentName) ?? '',
    pageCount: typeof raw.pagesCount === 'number' ? raw.pagesCount : undefined,
    order,
    platform: 'comsigntrust',
    metadata: strMap({ templateId: raw.templateId }),
    raw,
  }
}
