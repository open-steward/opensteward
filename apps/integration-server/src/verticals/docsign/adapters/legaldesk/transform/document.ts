import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawLegaldeskDocument } from './envelope'

/**
 * A document attached to a LegalDesk eSign transaction. Metadata only —
 * the canonical `Document` schema has no body field, and the adapter never
 * requests the signed PDF / base64 content or any download URL. LegalDesk
 * nests documents on the transaction; the canonical `externalId` is the
 * gateway `document_id` (falling back to a positional id).
 */
export interface RawLegaldeskDocumentDetail extends RawLegaldeskDocument {
  size?: string | number
  file_size?: string | number
  pages?: number | string
  page_count?: number | string
  mime_type?: string
  content_type?: string
  category?: string
}

export function transformDocument(
  raw: RawLegaldeskDocumentDetail,
  transactionId: string,
  index: number,
): Document {
  const externalId =
    pickStr(raw.document_id) ?? pickStr(raw.doc_id) ?? `${transactionId}:${index}`
  return {
    id: `${transactionId}:${externalId}`,
    externalId,
    envelopeId: transactionId,
    name: pickStr(raw.document_name) ?? pickStr(raw.file_name) ?? '',
    sizeBytes: pickNum(raw.size ?? raw.file_size),
    pageCount: pickNum(raw.pages ?? raw.page_count),
    mimeType: pickStr(raw.mime_type) ?? pickStr(raw.content_type),
    order: index,
    platform: 'legaldesk',
    metadata: strMap({ category: raw.category }),
    raw,
  }
}
