import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawPandaDocDocument } from './envelope'

/**
 * PandaDoc treats a document AS the envelope — there is no separate
 * `documents` collection on an envelope. We project a single canonical
 * Document per envelope with the envelope's name + id.
 */
export function transformDocument(raw: RawPandaDocDocument): Document {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId: raw.id,
    name: pickStr(raw.name) ?? '',
    order: 0,
    mimeType: 'application/pdf',
    platform: 'pandadoc',
    metadata: strMap({}),
    raw,
  }
}
