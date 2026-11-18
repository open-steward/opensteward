/**
 * A Mifiel document is a single file: CreateDocumentRequest takes one `file`
 * ("Document file (PDF)") or its hash, and the query record carries its one
 * `file_file_name`. The canonical Document of an envelope is therefore that
 * same record, at position 0, under the document's own id. Size, page count
 * and MIME type are not among the documented query attributes and are left
 * absent.
 */
import type { Document } from '../../../schema/document'
import { requireFileName, requireId, type RawMifielQueryDocument } from './envelope'

export function transformDocument(raw: RawMifielQueryDocument): Document {
  const id = requireId(raw)
  return {
    id,
    externalId: id,
    envelopeId: id,
    name: requireFileName(raw, id),
    order: 0,
    platform: 'mifiel',
    metadata: {},
    raw,
  }
}
