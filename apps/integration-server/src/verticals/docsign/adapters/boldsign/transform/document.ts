import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'
import type { RawBoldsignFile } from './envelope'

/**
 * BoldSign returns file metadata (name + page count) only on the document
 * properties endpoint. Files are not individually addressable, so we key them
 * by position within the document: `<documentId>:<order>`. There is no size or
 * mime field, and no content URL — content is REFUSED at the schema level.
 */
export function transformDocument(
  raw: RawBoldsignFile,
  documentId: string,
  order: number,
): Document {
  const name = pickStr(raw.documentName) ?? pickStr(raw.fileName) ?? ''
  return {
    id: `${documentId}:${order}`,
    externalId: `${documentId}:${order}`,
    envelopeId: documentId,
    name,
    pageCount: pickNum(raw.pageCount),
    mimeType: name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : undefined,
    order,
    platform: 'boldsign',
    metadata: strMap({ fileName: raw.fileName ?? raw.documentName }),
    raw,
  }
}
