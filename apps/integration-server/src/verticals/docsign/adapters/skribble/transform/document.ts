import type { Document } from '../../../schema/document'
import { pickNum, pickStr } from './shared'

/**
 * `GET /v2/documents/{id}` response, as documented in the "Document
 * (Response)" table (https://api-doc.skribble.com/, Documents / Object
 * details). Only the fields that table documents are declared.
 */
export interface RawSkribbleDocument {
  id?: string
  parent_id?: string
  title?: string
  content_type?: string
  size?: number
  page_count?: number
  page_width?: number
  page_height?: number
  owner?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

/**
 * Suffix of the canonical document id. A documented SignatureRequest
 * references exactly one `document_id`, and that id is not stable: "The
 * document ID you receive after uploading will never be the same ID after
 * signing, or any other change made to the document." (Documents folder,
 * https://api-doc.skribble.com/). So the canonical id names the request's
 * document slot, `<envelopeId>:document`, and `externalId` carries the
 * Skribble document id current at read time.
 */
export const SKRIBBLE_DOCUMENT_SLOT = 'document'

/**
 * The document is always position 0 of its envelope. The Document response
 * carries no reference back to its SignatureRequest, so the envelope id is
 * passed in.
 */
export function transformDocument(raw: RawSkribbleDocument, envelopeId: string): Document {
  const documentId = pickStr(raw.id)
  if (!documentId) throw new Error('Skribble document response has no id')
  const name = pickStr(raw.title)
  if (!name) throw new Error(`Skribble document ${documentId} has no title`)
  return {
    id: `${envelopeId}:${SKRIBBLE_DOCUMENT_SLOT}`,
    externalId: documentId,
    envelopeId,
    name,
    sizeBytes: pickNum(raw.size),
    pageCount: pickNum(raw.page_count),
    mimeType: pickStr(raw.content_type),
    order: 0,
    platform: 'skribble',
    metadata: {},
    raw,
  }
}
