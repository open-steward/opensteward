import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

export interface RawPenneoDocument {
  id: number | string
  title?: string
  pageCount?: number
  size?: number
  type?: number
  [key: string]: unknown
}

export function transformDocument(
  raw: RawPenneoDocument,
  envelopeId: string,
  order: number,
): Document {
  const id = String(raw.id)
  return {
    id,
    externalId: id,
    envelopeId,
    name: pickStr(raw.title) ?? `document-${order}`,
    sizeBytes: pickNum(raw.size),
    pageCount: pickNum(raw.pageCount),
    mimeType: 'application/pdf',
    order,
    platform: 'penneo',
    metadata: strMap({ type: raw.type }),
    raw,
  }
}
