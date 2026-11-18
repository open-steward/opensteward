/**
 * Yousign `Document` → canonical Document (metadata only, never content).
 *
 * Source: List Signature Request's Documents
 * (https://developers.youtrust.com/reference/get-signature_requests-signaturerequestid-documents-1.md),
 * whose 200 response is a bare array of `Document`. Only documented fields are read:
 * `id`, `filename`, `nature` ("enum":["attachment","signable_document"]),
 * `content_type`, `sha256`, `is_protected`, `is_signed`, `created_at`, and
 * `total_pages` ("Number of pages for signable document", nullable).
 */
import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap, toIso } from './shared'

export interface RawYousignDocument {
  id: string
  filename?: string
  nature?: string
  content_type?: string
  sha256?: string
  is_protected?: boolean
  is_signed?: boolean
  created_at?: string
  total_pages?: number | null
  [key: string]: unknown
}

export function transformDocument(
  raw: RawYousignDocument,
  envelopeId: string,
  order: number,
): Document {
  const name = pickStr(raw.filename)
  if (!name) throw new Error(`Yousign Document ${raw.id} carries no filename`)
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    name,
    pageCount: pickNum(raw.total_pages),
    mimeType: pickStr(raw.content_type),
    order,
    platform: 'yousign',
    metadata: strMap({
      nature: raw.nature,
      isSigned: raw.is_signed,
      isProtected: raw.is_protected,
      sha256: raw.sha256,
      createdAt: toIso(raw.created_at),
    }),
    raw,
  }
}
