import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * A file attached to a FPT.eContract contract (tài liệu). Metadata only —
 * the canonical Document schema has no content/url field, and the adapter
 * never requests the binary download endpoint.
 */
export interface RawFptEcontractDocument {
  id?: string | number
  documentId?: string | number
  name?: string
  fileName?: string
  fileType?: string
  contentType?: string
  mimeType?: string
  fileSize?: string | number
  size?: string | number
  numberOfPages?: string | number
  pageCount?: string | number
  order?: string | number
  [key: string]: unknown
}

function mimeFor(raw: RawFptEcontractDocument): string | undefined {
  const explicit = pickStr(raw.mimeType ?? raw.contentType)
  if (explicit) return explicit
  const t = (pickStr(raw.fileType) ?? '').toLowerCase()
  if (t === 'pdf') return 'application/pdf'
  if (t === 'doc' || t === 'docx') return 'application/msword'
  return pickStr(raw.fileType)
}

export function transformDocument(
  raw: RawFptEcontractDocument,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.documentId ?? raw.id) ?? String(index)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.fileName ?? raw.name) ?? '',
    sizeBytes: pickNum(raw.fileSize ?? raw.size),
    pageCount: pickNum(raw.numberOfPages ?? raw.pageCount),
    mimeType: mimeFor(raw),
    order: pickNum(raw.order) ?? index,
    platform: 'fpt-econtract',
    metadata: strMap({ fileType: raw.fileType }),
    raw,
  }
}
