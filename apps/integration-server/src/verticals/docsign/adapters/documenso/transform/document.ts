import type { Document } from '../../../schema/document'
import { idStr, pickStr, strMap } from './shared'
import type { RawDocumensoDocument } from './envelope'

/**
 * A Documenso document IS the envelope (there is no separate file attachment
 * manifest in the v1 API). We synthesise a canonical Document from the document
 * record — treating the document title as the file name and the document id
 * as the page-level identifier. One Document entry is emitted per envelope.
 */
export function transformDocument(raw: RawDocumensoDocument, index: number = 0): Document {
  const externalId = idStr(raw.id)
  const envelopeId = externalId
  const name = pickStr(raw.title) ?? `document-${externalId}`

  return {
    id: externalId,
    externalId,
    envelopeId,
    name,
    sizeBytes: undefined,
    pageCount: undefined,
    mimeType: 'application/pdf',
    order: index,
    platform: 'documenso',
    metadata: strMap({
      documentDataId: raw.documentDataId,
      source: raw.source,
      visibility: raw.visibility,
    }),
    raw,
  }
}
