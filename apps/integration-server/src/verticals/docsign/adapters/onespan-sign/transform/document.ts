import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * OneSpan Sign document — metadata only. The package carries `documents[]`
 * with id, name, size (bytes) and a `pages[]` array we just count.
 */
export interface RawOneSpanDocument {
  id?: string
  name?: string
  description?: string
  size?: number | string
  pages?: Array<unknown>
  index?: number | string
  type?: string
  external?: { provider?: string; providerName?: string; id?: string }
  [key: string]: unknown
}

export function transformDocument(
  raw: RawOneSpanDocument,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.id) ?? `${envelopeId}:${index}`
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.name) ?? '',
    sizeBytes: pickNum(raw.size),
    pageCount: Array.isArray(raw.pages) ? raw.pages.length : undefined,
    mimeType: raw.type ? pickStr(raw.type) : 'application/pdf',
    order: pickNum(raw.index) ?? index,
    platform: 'onespan-sign',
    metadata: strMap({
      description: raw.description,
      externalProvider: raw.external?.provider,
    }),
    raw,
  }
}
