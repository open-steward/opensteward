import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

/**
 * A PDF attached to a Tilaka signing request (`list_pdf[]`). Each entry is a
 * file keyed by `filename` (the upload handle returned by `/plus-upload`),
 * carrying its per-signer seal placements (`signatures[]` with page +
 * coordinates). We surface filename + page metadata only.
 *
 * Content is REFUSED: the canonical Document has no body field, and the
 * `presigned_url` / `signing_url` links Tilaka returns are deliberately NOT
 * mapped — they would expose the signed PDF.
 */
export interface RawTilakaPdfSignaturePlacement {
  user_identifier?: string
  page_number?: number | string
  width?: number | string
  height?: number | string
  coordinate_x?: number | string
  coordinate_y?: number | string
  [key: string]: unknown
}

export interface RawTilakaPdf {
  filename?: string
  document_name?: string
  signatures?: RawTilakaPdfSignaturePlacement[]
  pages?: number | string
  page_count?: number | string
  size?: number | string
  file_size?: number | string
  [key: string]: unknown
}

function maxPageNumber(raw: RawTilakaPdf): number | undefined {
  const pages = (raw.signatures ?? [])
    .map((s) => pickNum(s.page_number))
    .filter((n): n is number => typeof n === 'number')
  if (pages.length === 0) return undefined
  return Math.max(...pages)
}

export function transformDocument(raw: RawTilakaPdf, envelopeId: string, order: number): Document {
  const filename = pickStr(raw.filename ?? raw.document_name) ?? ''
  const externalId = filename || String(order)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: filename,
    sizeBytes: pickNum(raw.size ?? raw.file_size),
    pageCount: pickNum(raw.pages ?? raw.page_count) ?? maxPageNumber(raw),
    mimeType: 'application/pdf',
    order,
    platform: 'tilaka',
    metadata: strMap({ filename: raw.filename }),
    raw,
  }
}
