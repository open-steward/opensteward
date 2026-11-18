import type { Document } from '../../../schema/document'
import { strMap } from './shared'
import { documentFileId, type RawVismaSignFile } from './envelope'

/**
 * One entry of a document's `files` array (`GET /api/v1/document/{uuid}`:
 * `"files": [{ "filename": "0959d490-….pdf" }]`), at its position in that
 * array. "Only PDF files are supported" ("Add file to document").
 */
export function transformDocument(
  file: RawVismaSignFile,
  envelopeId: string,
  index: number,
): Document {
  if (typeof file.filename !== 'string' || file.filename === '') {
    throw new Error(`Visma Sign document ${envelopeId} file ${index} has no filename`)
  }
  const id = documentFileId(envelopeId, index)
  return {
    id,
    externalId: id,
    envelopeId,
    name: file.filename,
    mimeType: 'application/pdf',
    order: index,
    platform: 'visma-sign',
    metadata: strMap({}),
    raw: file,
  }
}
