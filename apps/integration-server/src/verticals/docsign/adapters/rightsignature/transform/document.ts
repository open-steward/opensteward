import type { Document } from '../../../schema/document'

/**
 * RightSignature is one file per document: `GET /public/v1/documents/:id`
 * (https://api.rightsignature.com/documentation/resources/v1/documents, show
 * example) carries the file's metadata on the document itself:
 *
 *   "id": "4840dd4f-...", "name": "Test", "filename": "application.pdf"
 *
 * No size, page count or MIME type is documented, so none is emitted. File
 * URLs (`original_file_url`, `signed_pdf_url`, `page_image_urls`) are refused
 * by the canonical schema and are not copied out of `raw`'s declared type.
 */
export interface RawRightSignatureDocumentFile {
  id: string
  name?: string
  filename?: string
}

export function transformDocument(raw: RawRightSignatureDocumentFile): Document {
  if (typeof raw.id !== 'string' || raw.id === '') {
    throw new Error('RightSignature document has no id')
  }
  if (typeof raw.filename !== 'string' || raw.filename === '') {
    throw new Error(`RightSignature document ${raw.id} has no filename`)
  }
  return {
    id: `${raw.id}:${raw.id}`,
    externalId: raw.id,
    envelopeId: raw.id,
    name: raw.filename,
    order: 0,
    platform: 'rightsignature',
    metadata: raw.name ? { document_name: raw.name } : {},
    raw: { id: raw.id, name: raw.name, filename: raw.filename },
  }
}
