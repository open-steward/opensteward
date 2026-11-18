import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawSignWellDocument } from './envelope'

/**
 * SignWell exposes one document per envelope. We project the document
 * record itself (the envelope) into the canonical Document shape.
 */
export function transformDocument(
  raw: RawSignWellDocument,
  envelopeId: string,
): Document {
  const externalId = pickStr(raw.id) ?? envelopeId
  const firstFile = Array.isArray(raw.files) ? raw.files[0] : undefined
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(firstFile?.name) ?? pickStr(raw.name) ?? '',
    sizeBytes: pickNum(firstFile?.file_size ?? raw.size),
    pageCount: pickNum(firstFile?.pages ?? raw.number_of_pages ?? raw.page_count),
    mimeType: 'application/pdf',
    order: 0,
    platform: 'signwell',
    metadata: strMap({
      numberOfDocuments: raw.number_of_documents,
    }),
    raw,
  }
}
