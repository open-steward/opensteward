/**
 * Nitro Sign document → canonical Document (metadata only).
 *
 * The document responses of https://api.gonitro.dev/openapi.json
 * (`PendingDocumentResponse`, `UploadedDocumentResponse`,
 * `FailedDocumentResponse`, `SignedDocumentResponse`,
 * `SealedDocumentResponse`) all declare `required: [ID, name]` plus optional
 * `createdAt`, `status` (enum pending | uploaded | failed | signed | sealed),
 * `sizeBytes` ("Size in bytes of the document."), `numPages` ("Number of
 * pages of the document.") and, on Failed, `failureReason`. No media type is
 * documented, so `mimeType` is omitted.
 *
 * `order` is the document's position in the envelope's `items` array, which
 * the API keeps in envelope order (the reorder endpoint returns "an `items`
 * array within the JSON response reflecting the new order").
 */
import type { Document } from '../../../schema/document'
import { pickNum, pickStr, strMap } from './shared'

export interface RawNitroSignDocument {
  ID?: string
  name?: string
  createdAt?: string
  status?: string
  sizeBytes?: number
  numPages?: number
  failureReason?: string
}

export function transformDocument(
  raw: RawNitroSignDocument,
  envelopeId: string,
  index: number,
): Document {
  const externalId = pickStr(raw.ID)
  if (!externalId) throw new Error(`Nitro Sign document on envelope ${envelopeId} has no ID`)
  const name = pickStr(raw.name)
  if (name === undefined) throw new Error(`Nitro Sign document ${externalId} has no name`)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name,
    sizeBytes: pickNum(raw.sizeBytes),
    pageCount: pickNum(raw.numPages),
    order: index,
    platform: 'nitro-sign',
    metadata: strMap({
      status: raw.status,
      createdAt: raw.createdAt,
      failureReason: raw.failureReason,
    }),
    raw,
  }
}
