import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * A Zefort esign document (id prefix `esdc_`) maps to the canonical Document.
 * Metadata only — file content is never read. Zefort exposes `filename`,
 * `content_type`, `num_pages` and `signable`/`needs_to_be_viewed` flags.
 */
export interface RawZefortDocument {
  id?: string
  filename?: string
  content_type?: string
  num_pages?: number
  signable?: boolean
  needs_to_be_viewed?: boolean
  status?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawZefortDocument,
  envelopeId: string,
  order: number,
): Document {
  const externalId = raw.id ?? `${envelopeId}:${order}`
  return {
    id: externalId,
    externalId,
    envelopeId,
    name: pickStr(raw.filename) ?? `document-${order}`,
    pageCount: pickNum(raw.num_pages),
    mimeType: pickStr(raw.content_type) ?? 'application/pdf',
    order,
    platform: 'zefort',
    metadata: strMap({
      signable: raw.signable,
      needsToBeViewed: raw.needs_to_be_viewed,
      status: raw.status,
    }),
    raw,
  }
}
