import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * A Signority file entry, nested under `document.files`. Each file carries a
 * `pages` array (one entry per rendered page) but no byte size or content —
 * which suits the canonical Document, whose schema deliberately omits content.
 */
export interface RawSignorityFile {
  id?: number | string
  name?: string
  sequence?: number | string
  type?: number | string
  pages?: Array<unknown>
  [key: string]: unknown
}

export function transformDocument(
  raw: RawSignorityFile,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.id) ?? String(index)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.name) ?? '',
    pageCount: Array.isArray(raw.pages) ? raw.pages.length : undefined,
    order: pickNum(raw.sequence) ?? index,
    platform: 'signority',
    metadata: strMap({ type: raw.type }),
    raw,
  }
}
