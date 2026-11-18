import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'
import type { RawValidatedIdDocumentInfo } from './envelope'

/**
 * VIDsigner signs a single document per job, so the document IS the
 * job (`DocumentInfoDTO`): there is one canonical Document per envelope,
 * keyed by `DocGUI`, with `FileName` as the name. VIDsigner is always
 * PDF.
 *
 * Document content (`DocContent`, base64 PDF) is REFUSED — it is never
 * read into the canonical Document, which has no content field.
 */
export function transformDocument(
  raw: RawValidatedIdDocumentInfo,
  envelopeId: string,
  order: number,
): Document {
  const name = pickStr(raw.FileName) ?? `document-${order}`
  return {
    id: raw.DocGUI,
    externalId: raw.DocGUI,
    envelopeId,
    name,
    mimeType: 'application/pdf',
    order,
    platform: 'validated-id',
    metadata: strMap({ docStatus: raw.DocStatus }),
    raw,
  }
}
