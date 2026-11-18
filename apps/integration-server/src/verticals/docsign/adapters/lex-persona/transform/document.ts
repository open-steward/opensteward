/**
 * Goodflag Signature `Document` → canonical `Document`.
 *
 * Fields are the documented `Document` type of `GET /api/documents` and
 * `GET /api/documents/{documentId}`
 * (https://docs.goodflag.com/wm/api-reference/documentation-api/token-portail/workflow-documents/search-documents.md).
 */
import type { Document } from '../../../schema/document'
import { msToIso, str } from './shared'

export interface RawGoodflagDocumentPart {
  contentType: string
  filename: string
  hash: string
  size: number
  isOriginal?: boolean
  [key: string]: unknown
}

export interface RawGoodflagDocument {
  created: number
  displayedParts: RawGoodflagDocumentPart[]
  groupId: string
  id: string
  parts: RawGoodflagDocumentPart[]
  tenantId: string
  updated: number
  userId: string
  workflowId: string
  workflowName: string
  confidentiality?: boolean
  orderIndex?: number
  signatureProfileId?: string
  subOrderIndex?: number
  [key: string]: unknown
}

/**
 * `position` is the row's 0-based place in the search result, used for
 * `order` only when the document has no `orderIndex` ("L'index d'ordre permet
 * de personnaliser l'ordre d'affichage des documents").
 *
 * The name, size and type come from the first of `parts` ("Les parties du
 * document"), which a document always has: `parts` is required both on the
 * `Document` type and on "Créer un document"
 * (https://docs.goodflag.com/wm/api-reference/documentation-api/token-portail/workflow-documents/create-document.md).
 */
export function transformDocument(raw: RawGoodflagDocument, position: number): Document {
  const part = raw.parts?.[0]
  if (!part) {
    throw new Error(`lex-persona document ${raw.id} has no parts, so it has no filename`)
  }
  const orderIndex =
    typeof raw.orderIndex === 'number' && Number.isInteger(raw.orderIndex) && raw.orderIndex >= 0
      ? raw.orderIndex
      : undefined
  const metadata: Record<string, string> = {
    workflowName: raw.workflowName,
    hash: part.hash,
    // "S'il est absent, le document est une pièce jointe."
    attachment: String(raw.signatureProfileId === undefined),
  }
  const signatureProfileId = str(raw.signatureProfileId)
  if (signatureProfileId) metadata['signatureProfileId'] = signatureProfileId
  const created = msToIso(raw.created)
  if (created) metadata['created'] = created
  return {
    id: raw.id,
    externalId: raw.id,
    envelopeId: raw.workflowId,
    name: part.filename,
    sizeBytes: Number.isInteger(part.size) && part.size >= 0 ? part.size : undefined,
    mimeType: str(part.contentType),
    order: orderIndex ?? position,
    platform: 'lex-persona',
    metadata,
    raw,
  }
}
