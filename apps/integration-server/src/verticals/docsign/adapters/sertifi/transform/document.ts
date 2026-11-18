import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * Sertifi document → canonical Document (metadata only).
 *
 * Sertifi documents are always PDFs (the platform converts uploads to PDF
 * before signing). Sertifi does not expose byte size or page count on the
 * document object, so those optionals resolve to undefined. Content is
 * never read — the canonical Document schema has no content field, and the
 * adapter never calls Sertifi's `…/content/signed` binary endpoint.
 */
export interface RawSertifiDocument {
  documentId?: string
  filename?: string
  title?: string
  /** Unsigned | Signed | ConvertingToPdf | PartiallySigned | SignedAndArchived | Declined | Expired | ConversionFailed | Undefined. */
  documentStatus?: string
  createdAt?: string
  signedAt?: string
  isExpired?: boolean
  [key: string]: unknown
}

export function transformDocument(
  raw: RawSertifiDocument,
  envelopeId: string,
  order: number,
): Document {
  const externalId = pickStr(raw.documentId) ?? `${envelopeId}:${order}`
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: pickStr(raw.title) ?? pickStr(raw.filename) ?? '',
    mimeType: 'application/pdf',
    order,
    platform: 'sertifi',
    metadata: strMap({
      filename: raw.filename,
      documentStatus: raw.documentStatus,
      isExpired: raw.isExpired,
      createdAt: raw.createdAt,
      signedAt: raw.signedAt,
    }),
    raw,
  }
}
