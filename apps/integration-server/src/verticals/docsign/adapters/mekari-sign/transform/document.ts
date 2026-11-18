import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawMekariSignDocument } from './envelope'

/**
 * Mekari Sign treats each "document" as a single uploaded file (the
 * envelope and the file are the same resource). The canonical Document is
 * derived from the file-level fields on that object — filename, page count,
 * size — addressed by the document id. Content is never surfaced.
 */
export function transformDocument(raw: RawMekariSignDocument): Document {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId: raw.id,
    name: pickStr(raw.filename) ?? pickStr(raw.doc_name) ?? pickStr(raw.title) ?? '',
    sizeBytes: pickNum(raw.size_bytes) ?? pickNum(raw.size),
    pageCount: pickNum(raw.page_count),
    mimeType: pickStr(raw.mime_type) ?? 'application/pdf',
    order: 0,
    platform: 'mekari-sign',
    metadata: strMap({
      category: raw.category,
      stampingStatus: raw.stamping_status,
    }),
    raw,
  }
}
