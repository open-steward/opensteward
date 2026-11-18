import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawGetAcceptDocument } from './envelope'

/**
 * GetAccept treats one document per envelope — project the document record
 * itself into the canonical Document shape.
 */
export function transformDocument(
  raw: RawGetAcceptDocument,
  envelopeId: string,
): Document {
  const externalId = pickStr(raw.id) ?? envelopeId
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.name) ?? '',
    sizeBytes: pickNum(raw.size),
    pageCount: pickNum(raw.page_count ?? raw.document_total_pages),
    mimeType: 'application/pdf',
    order: 0,
    platform: 'getaccept',
    metadata: strMap({
      type: raw.type,
      isTemplate: raw.is_template,
    }),
    raw,
  }
}
