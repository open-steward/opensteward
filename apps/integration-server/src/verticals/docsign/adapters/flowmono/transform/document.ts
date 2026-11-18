/**
 * Transform a raw Flowmono document/file entry into the canonical Document shape.
 *
 * Documents are returned from
 * GET /api/ExternalApplication/getsigningrequestdocumentbyclientreference/{clientReference}
 * with file details embedded in the response entity.
 *
 * Only metadata is exposed — binary content is never requested.
 */
import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * Raw Flowmono document/file entry from the signing request document endpoint.
 * Field names derived from the FileDetails and FilesVm swagger definitions.
 */
export interface RawFlowmonoDocument {
  /** Numeric document identifier. */
  id?: number | string
  /** File/document name including extension. */
  name?: string
  fileName?: string
  /** MIME type string e.g. "application/pdf". */
  mimeType?: string
  extension?: string
  /** File URL (never fetched by adapter). */
  fileUrl?: string
  /** Byte size of the file. */
  fileSize?: number | string
  /** Number of pages in the document. */
  pageCount?: number | string
  [key: string]: unknown
}

export function transformDocument(raw: RawFlowmonoDocument, envelopeId: string): Document {
  const idStr = pickStr(raw.id) ?? pickStr(raw.fileName) ?? pickStr(raw.name) ?? '0'
  const nameStr = pickStr(raw.name) ?? pickStr(raw.fileName) ?? ''
  const ext = pickStr(raw.extension)
  let mimeType = pickStr(raw.mimeType)
  if (!mimeType && ext) {
    if (ext.toLowerCase() === 'pdf') mimeType = 'application/pdf'
  }
  return {
    id: `${envelopeId}:${idStr}`,
    externalId: idStr,
    envelopeId,
    name: nameStr,
    sizeBytes: pickNum(raw.fileSize),
    pageCount: pickNum(raw.pageCount),
    mimeType,
    order: 0,
    platform: 'flowmono',
    metadata: strMap({ fileUrl: raw.fileUrl, extension: raw.extension }),
    raw,
  }
}
