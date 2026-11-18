import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawD4SignDocument } from './envelope'

/**
 * D4Sign exposes one document per record (the document IS the envelope).
 * Filename + metadata only — content bytes (`/documents/{id}/download`)
 * are never fetched.
 */
export function transformDocument(raw: RawD4SignDocument): Document {
  return {
    id: raw.uuid,
    externalId: raw.uuid,
    envelopeId: raw.uuid,
    name: pickStr(raw.nameDoc) ?? pickStr(raw.name) ?? '',
    sizeBytes: pickNum(raw.size),
    pageCount: pickNum(raw.pages),
    mimeType: pickStr(raw.type) === 'pdf' ? 'application/pdf' : pickStr(raw.type),
    order: 0,
    platform: 'd4sign',
    metadata: strMap({ uuidSafe: raw.uuid_safe }),
    raw,
  }
}
