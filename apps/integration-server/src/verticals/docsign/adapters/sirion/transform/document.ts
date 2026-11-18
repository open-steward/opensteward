import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * SirionOne contract document — a file attached to a contract. SirionOne
 * returns filename + size + page metadata only; the binary is fetched
 * separately and is deliberately never surfaced through this adapter.
 */
export interface RawSirionDocument {
  documentId?: string
  fileName?: string
  name?: string
  pageCount?: number
  fileSize?: number
  sizeInBytes?: number
  mimeType?: string
  contentType?: string
  documentType?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawSirionDocument,
  envelopeId: string,
  order: number,
): Document {
  const id = raw.documentId ?? `${envelopeId}:${order}`
  return {
    id,
    externalId: id,
    envelopeId,
    name: pickStr(raw.fileName) ?? pickStr(raw.name) ?? `document-${order}`,
    sizeBytes: pickNum(raw.fileSize) ?? pickNum(raw.sizeInBytes),
    pageCount: pickNum(raw.pageCount),
    mimeType: pickStr(raw.mimeType) ?? pickStr(raw.contentType) ?? 'application/pdf',
    order,
    platform: 'sirion',
    metadata: strMap({ documentType: raw.documentType }),
    raw,
  }
}
