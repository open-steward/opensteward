import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * Assently DocumentModel → canonical Document (metadata only).
 *
 * The raw model also carries `data` (base64-encoded file content); it is
 * intentionally never read or surfaced — the canonical Document schema has no
 * content field and that absence is the firewall.
 */
export interface RawAssentlyDocument {
  id?: string
  filename?: string
  contentType?: string
  size?: number | string
  hash?: string
  /** original | receipt | hash | batchfile | unsealedreceipt | partyattachment */
  type?: string
  order?: number | string
  title?: string
  isRequired?: boolean
  [key: string]: unknown
}

export function transformDocument(
  raw: RawAssentlyDocument,
  envelopeId: string,
  index: number,
): Document {
  const docId = pickStr(raw.id) ?? String(index)
  return {
    id: `${envelopeId}:${docId}`,
    externalId: docId,
    envelopeId,
    name: pickStr(raw.filename) ?? pickStr(raw.title) ?? '',
    sizeBytes: pickNum(raw.size),
    mimeType: pickStr(raw.contentType),
    order: pickNum(raw.order) ?? index,
    platform: 'assently',
    metadata: strMap({
      type: raw.type,
      title: raw.title,
      hash: raw.hash,
      isRequired: raw.isRequired,
    }),
    raw,
  }
}
