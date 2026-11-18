import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawXodoSignFile } from './envelope'

export type { RawXodoSignFile } from './envelope'

/**
 * Xodo Sign files are always PDFs and expose only `name`, `file_id`, and a
 * `pages` count — no byte size on the document payload. The list-order
 * `index` doubles as the canonical 0-indexed `order` and, when `file_id`
 * is absent, as the addressable id.
 */
export function transformDocument(
  raw: RawXodoSignFile,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.file_id) ?? String(index)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.name) ?? `document-${index}`,
    pageCount: pickNum(raw.pages),
    mimeType: 'application/pdf',
    order: index,
    platform: 'xodo-sign',
    metadata: strMap({ fileId: raw.file_id }),
    raw,
  }
}
