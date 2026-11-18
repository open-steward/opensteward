import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * Raw GMO Sign document, embedded in an envelope's `document_list`. GMO Sign
 * keys documents by `control_number` (some responses also carry `documentId`)
 * and exposes only the filename as metadata — never the file body. Content is
 * REFUSED at the canonical-schema level, so size/pages/mime are left unset
 * unless GMO Sign volunteers them.
 *
 * Docs: https://learn.microsoft.com/en-us/connectors/gmosign/
 */
export interface RawGmoSignDocument {
  control_number?: string
  documentId?: string
  document_name?: string
  document_code?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawGmoSignDocument,
  envelopeId: string,
  order: number,
): Document {
  const docId = pickStr(raw.control_number) ?? pickStr(raw.documentId) ?? pickStr(raw.document_code) ?? String(order)
  return {
    id: `${envelopeId}:${docId}`,
    externalId: docId,
    envelopeId,
    name: pickStr(raw.document_name) ?? '',
    order,
    platform: 'gmo-sign',
    metadata: strMap({ document_code: raw.document_code }),
    raw,
  }
}
