import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawAutentiqueDocument } from './envelope'

/** Autentique treats one document per signing request. */
export function transformDocument(raw: RawAutentiqueDocument): Document {
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId: raw.id,
    name: pickStr(raw.name) ?? '',
    mimeType: 'application/pdf',
    order: 0,
    platform: 'autentique',
    metadata: strMap({}),
    raw,
  }
}
