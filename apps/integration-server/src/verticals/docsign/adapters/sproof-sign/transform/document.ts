import type { Document } from '../../../schema/document'
import { pickStr, strMap, type RawSproofDocument } from './shared'

/**
 * A sproof `_Document` is a single file ("Document ID", "Document name"), so
 * each envelope has exactly one Document, at order 0. The spec documents no
 * size, page count or MIME type on it; none is set.
 */
export function transformDocument(raw: RawSproofDocument, envelopeId: string): Document {
  const documentId = pickStr(raw.id)
  if (!documentId) throw new Error('sproof-sign: document has no document id')
  return {
    id: `${envelopeId}:${documentId}`,
    externalId: documentId,
    envelopeId,
    name: pickStr(raw.name) ?? '',
    order: 0,
    platform: 'sproof-sign',
    metadata: strMap({ state: raw.state }),
    raw,
  }
}
