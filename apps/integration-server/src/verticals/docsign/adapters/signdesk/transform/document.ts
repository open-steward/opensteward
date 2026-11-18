import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawSigndeskDocumentFile } from './envelope'

/**
 * Maps a SignDesk document attached to an eSign request. Filename + size +
 * page-count metadata only — signed-PDF content, base64 blobs, Aadhaar
 * eSign XML payloads, signature images, and DSC certificate bundles are
 * never fetched (the canonical schema has no content field).
 */
export function transformDocument(
  raw: RawSigndeskDocumentFile,
  envId: string,
  index: number,
): Document {
  const id = pickStr(raw.document_id) ?? `${envId}:${index}`
  return {
    id,
    externalId: id,
    envelopeId: envId,
    name: pickStr(raw.document_name) ?? pickStr(raw.file_name) ?? '',
    sizeBytes: pickNum(raw.size_bytes),
    pageCount: pickNum(raw.page_count),
    mimeType: pickStr(raw.content_type) ?? 'application/pdf',
    order: index,
    platform: 'signdesk',
    metadata: strMap({ fileName: raw.file_name }),
    raw,
  }
}
