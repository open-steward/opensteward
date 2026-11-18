import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * The single uploaded file behind a Privy document. Privy exposes the file
 * via the document detail; we surface filename + size as metadata only.
 *
 * Content is REFUSED: the canonical Document has no body field, and the
 * `urlDocument` / `download` links Privy returns are deliberately NOT
 * mapped to any content/url field — they would expose the signed PDF.
 */
export interface RawPrivyDocumentFile {
  docToken: string
  documentTitle?: string
  title?: string
  filename?: string
  fileName?: string
  docType?: string
  mimeType?: string
  /** Stringified or numeric byte size, when Privy reports it. */
  size?: string | number
  fileSize?: string | number
  pages?: number | string
  pageCount?: number | string
  [key: string]: unknown
}

export function transformDocument(raw: RawPrivyDocumentFile, envelopeId: string): Document {
  const name = pickStr(raw.filename ?? raw.fileName ?? raw.documentTitle ?? raw.title) ?? ''
  return {
    id: raw.docToken ? `${envelopeId}:${raw.docToken}` : envelopeId,
    externalId: raw.docToken ?? envelopeId,
    envelopeId,
    name,
    sizeBytes: pickNum(raw.size ?? raw.fileSize),
    pageCount: pickNum(raw.pages ?? raw.pageCount),
    mimeType: pickStr(raw.mimeType) ?? 'application/pdf',
    order: 0,
    platform: 'privyid',
    metadata: strMap({ docType: raw.docType }),
    raw,
  }
}
