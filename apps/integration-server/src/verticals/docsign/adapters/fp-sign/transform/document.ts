import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * FP Sign `Document`. The wire object carries a base64 `content` field; the
 * canonical Document schema has no body field, so `content` is dropped at the
 * transform boundary and never reflected. `hashValue` (a non-reversible digest)
 * is safe to surface as metadata.
 */
export interface RawFpSignDocument {
  id?: number | string
  name?: string
  documentType?: string
  hashValue?: string
  // `content` (base64 PDF) is intentionally absent from this type — never read.
  [key: string]: unknown
}

export function transformDocument(
  raw: RawFpSignDocument,
  envelopeId: string,
  order: number,
): Document {
  const id = pickStr(raw.id) ?? `${envelopeId}:doc:${order}`
  return {
    id,
    externalId: id,
    envelopeId,
    name: pickStr(raw.name) ?? `document-${order}`,
    mimeType: 'application/pdf',
    order,
    platform: 'fp-sign',
    metadata: strMap({
      documentType: raw.documentType,
      hashValue: raw.hashValue,
    }),
    raw: { id: raw.id, name: raw.name, documentType: raw.documentType, hashValue: raw.hashValue },
  }
}
