import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

export interface RawLuxTrustDocumentEntry {
  id?: string
  name?: string
  pages?: number
  size_bytes?: number
  [key: string]: unknown
}

export function transformDocument(
  raw: RawLuxTrustDocumentEntry,
  envelopeId: string,
  order: number,
): Document {
  return {
    id: raw.id ?? `${envelopeId}:${order}`,
    externalId: raw.id ?? `${envelopeId}:${order}`,
    envelopeId,
    name: pickStr(raw.name) ?? `document-${order}`,
    sizeBytes: pickNum(raw.size_bytes),
    pageCount: pickNum(raw.pages),
    mimeType: 'application/pdf',
    order,
    platform: 'luxtrust',
    metadata: strMap({}),
    raw,
  }
}
