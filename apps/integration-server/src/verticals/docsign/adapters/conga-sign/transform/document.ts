import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * Conga Sign / OneSpan package document. Metadata only — content is refused at
 * the schema level. OneSpan reports document order via `index`, page count via
 * `pages`, and size via `size`.
 */
export interface RawCongaSignDocument {
  id?: string
  name?: string
  index?: number
  pages?: number | unknown[]
  size?: number
  description?: string
  [key: string]: unknown
}

function pageCount(pages: RawCongaSignDocument['pages']): number | undefined {
  if (Array.isArray(pages)) return pages.length
  return pickNum(pages)
}

export function transformDocument(
  raw: RawCongaSignDocument,
  envelopeId: string,
  order: number,
): Document {
  const id = pickStr(raw.id) ?? `${envelopeId}:${order}`
  return {
    id,
    externalId: id,
    envelopeId,
    name: pickStr(raw.name) ?? `document-${order}`,
    sizeBytes: pickNum(raw.size),
    pageCount: pageCount(raw.pages),
    mimeType: 'application/pdf',
    order: typeof raw.index === 'number' ? raw.index : order,
    platform: 'conga-sign',
    metadata: strMap({ description: raw.description }),
    raw,
  }
}
