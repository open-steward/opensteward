import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawCloudSignDocument } from './envelope'

/** CloudSign treats a document as the envelope; single Document per envelope. */
export function transformDocument(raw: RawCloudSignDocument): Document {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId: raw.id,
    name: pickStr(raw.title) ?? '',
    mimeType: 'application/pdf',
    order: 0,
    platform: 'cloudsign',
    metadata: strMap({}),
    raw,
  }
}
