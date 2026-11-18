import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawSigniFlowDocument } from './envelope'
import { documentId } from './envelope'

/**
 * SigniFlow models the signing job AS a single document — there is no separate
 * documents collection per workflow. The canonical Document is therefore
 * derived from the same payload as the Envelope, surfacing filename, page
 * count and extension/MIME. The binary content (`Document`, base64) is never
 * read; only metadata is mapped.
 */
const EXT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}

function mimeFor(ext: string | undefined): string | undefined {
  if (!ext) return undefined
  const key = ext.replace(/^\./, '').toLowerCase()
  return EXT_MIME[key] ?? undefined
}

export function transformDocument(raw: RawSigniFlowDocument, envelopeId: string): Document {
  const id = documentId(raw) || envelopeId
  const ext = pickStr(raw.DocExtension ?? raw.DocumentExtension)
  const name = pickStr(raw.DocName ?? raw.DocumentName) ?? ''
  return {
    id,
    externalId: id,
    envelopeId,
    name,
    sizeBytes: pickNum(raw['DocumentSize'] ?? raw['FileSize']),
    pageCount: pickNum(raw['PageCount'] ?? raw['Pages']),
    mimeType: mimeFor(ext),
    order: 0,
    platform: 'signiflow',
    metadata: strMap({ extension: ext }),
    raw,
  }
}
