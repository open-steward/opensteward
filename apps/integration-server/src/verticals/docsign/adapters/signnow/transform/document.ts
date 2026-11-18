import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawSignNowDocument } from './envelope'

/**
 * SignNow exposes one document per record (the document IS the envelope).
 */
export function transformDocument(raw: RawSignNowDocument): Document {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId: raw.id,
    name: pickStr(raw.document_name) ?? '',
    pageCount: typeof raw.page_count === 'number' ? raw.page_count : undefined,
    mimeType: 'application/pdf',
    order: 0,
    platform: 'signnow',
    metadata: strMap({ originDocumentId: raw.origin_document_id }),
    raw,
  }
}
