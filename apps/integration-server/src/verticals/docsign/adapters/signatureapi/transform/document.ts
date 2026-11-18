import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * SignatureAPI document (embedded in the envelope payload). Metadata only —
 * the canonical Document schema has no content/url field, and the adapter
 * never surfaces the underlying file. SignatureAPI documents are PDF or DOCX
 * sources with "places" (signature fields); only the name/title is exposed.
 *
 * Docs: https://signatureapi.com/docs/api/resources/envelopes
 */
export interface RawSignatureapiDocument {
  id: string
  title?: string
  name?: string
  format?: string
  pages?: number
  [key: string]: unknown
}

const FORMAT_MIME: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

export function transformDocument(
  raw: RawSignatureapiDocument,
  envelopeId: string,
  order: number,
): Document {
  const format = (raw.format ?? '').toLowerCase()
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    name: pickStr(raw.title) ?? pickStr(raw.name) ?? `document-${order}`,
    pageCount: pickNum(raw.pages),
    mimeType: FORMAT_MIME[format] ?? (format ? format : undefined),
    order,
    platform: 'signatureapi',
    metadata: strMap({ format: raw.format }),
    raw,
  }
}
