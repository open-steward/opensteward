/**
 * Annature document → canonical Document.
 *
 * Fields per "The Document object"
 * (https://docs.annature.com.au/api-reference/documents/document-object.md):
 * `id`, `name`, `pages`, `original`, `master`, `created`. "A document
 * represents the content of an envelope in the form of a PDF", and "Word
 * files (.doc or .docx) are automatically converted to PDF during upload".
 *
 * `order` is the position in `GET /v1/documents?envelope_id=`: "Documents are
 * returned in the same order they were supplied in the request body when the
 * envelope was created." No size is documented, so `sizeBytes` is omitted.
 * `original` and `master` are download links to the content and are dropped.
 */
import type { Document } from '../../../schema/document'
import { strMap } from './shared'

export interface RawAnnatureDocument {
  id: string
  name: string
  pages?: number | null
  original?: string | null
  master?: string | null
  created?: string | null
}

export function transformDocument(
  raw: RawAnnatureDocument,
  envelopeId: string,
  order: number,
): Document {
  const { original: _o, master: _m, ...rest } = raw
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId,
    name: raw.name,
    pageCount: raw.pages ?? undefined,
    mimeType: 'application/pdf',
    order,
    platform: 'annature',
    metadata: strMap({ created: raw.created }),
    raw: rest,
  }
}
