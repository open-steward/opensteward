import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawSignableEnvelopeDocument } from './envelope'

/**
 * Documents are the `envelope_documents` of a Signable envelope (returned by
 * the envelope-detail endpoint only). Signable renders every uploaded file
 * (PDF, Word, Excel) to PDF, so `mimeType` is always application/pdf. Size in
 * bytes is not exposed — only the page count. The binary content
 * (document_pdf_url / document_signed_pdf / page images) is intentionally NOT
 * surfaced: the canonical Document schema has no content field.
 */
export function transformDocument(
  raw: RawSignableEnvelopeDocument,
  envelopeId: string,
  order: number,
): Document {
  return {
    id: `${envelopeId}:${raw.document_fingerprint}`,
    externalId: raw.document_fingerprint,
    envelopeId,
    name: pickStr(raw.document_title) ?? '',
    pageCount: pickNum(raw.document_page_total),
    mimeType: 'application/pdf',
    order,
    platform: 'signable',
    metadata: strMap({ documentFingerprint: raw.document_fingerprint }),
    raw,
  }
}
