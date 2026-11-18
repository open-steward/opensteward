import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawClicksignDocument } from './envelope'

/**
 * Clicksign exposes one document per "document" record (the document IS the
 * envelope). Filename + metadata only — content bytes are never fetched.
 */
export function transformDocument(raw: RawClicksignDocument): Document {
  return {
    id: raw.key,
    externalId: raw.key,
    envelopeId: raw.key,
    name: pickStr(raw.filename_with_extension) ?? pickStr(raw.filename) ?? '',
    mimeType: 'application/pdf',
    order: 0,
    platform: 'clicksign',
    metadata: strMap({ signableGroup: raw.signable_group }),
    raw,
  }
}
