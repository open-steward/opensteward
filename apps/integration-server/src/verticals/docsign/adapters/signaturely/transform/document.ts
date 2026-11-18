import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * Signaturely does not have a dedicated per-file metadata endpoint. Files are
 * nested inside a document's `parts` array, which carries an id, an upload
 * order, and the original filename. We project one canonical Document per part.
 *
 * Fields not provided by the API (sizeBytes, pageCount, mimeType) are omitted
 * rather than fabricated.
 */
export interface RawSignaturelyPart {
  id?: string
  order?: number
  originalFileName?: string | null
  [key: string]: unknown
}

export function transformDocument(
  raw: RawSignaturelyPart,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.id) ?? `${envelopeId}:${index}`
  const order = pickNum(raw.order) ?? index
  const name = pickStr(raw.originalFileName) ?? `document-${index}`

  // Infer PDF from the filename extension when available.
  const lower = name.toLowerCase()
  const mimeType = lower.endsWith('.pdf')
    ? 'application/pdf'
    : lower.endsWith('.docx')
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : lower.endsWith('.doc')
        ? 'application/msword'
        : undefined

  return {
    id: externalId,
    externalId,
    envelopeId,
    name,
    mimeType,
    order,
    platform: 'signaturely',
    metadata: strMap({ rawId: raw.id, rawOrder: raw.order }),
    raw,
  }
}
