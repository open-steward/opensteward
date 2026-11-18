import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawCertinalDocument } from './envelope'

/**
 * Certinal documents nest in the transaction `data.documents[]`. The platform
 * exposes filename + page count + sequence + flags, but no byte size and no
 * mime type. Filenames are typically PDFs, so we infer `application/pdf` from
 * a `.pdf` suffix and otherwise leave mimeType undefined. Content is never
 * surfaced — the canonical Document schema has no body field.
 */
export function transformDocument(raw: RawCertinalDocument, envelopeId: string): Document {
  const name = pickStr(raw.fileName) ?? ''
  const mimeType = /\.pdf$/i.test(name) ? 'application/pdf' : undefined
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    name,
    pageCount: pickNum(raw.pageCount),
    mimeType,
    order: pickNum(raw.sequence) ?? 0,
    platform: 'certinal',
    metadata: strMap({ deletable: raw.deletable, private: raw.private }),
    raw,
  }
}
