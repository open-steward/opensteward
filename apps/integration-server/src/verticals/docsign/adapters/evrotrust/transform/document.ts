import type { Document } from '../../../schema/document'
import { pickStr, strMap } from './shared'

/**
 * Evrotrust single-document status response (`/document/status`). A document
 * is identified by a `transactionID` and belongs to a signing thread
 * (`threadID`, the canonical envelope). The status response carries no file
 * size / page-count metadata and — by design — never any document content;
 * content download is refused at the adapter level.
 */
export interface RawEvrotrustDocumentStatus {
  transactionID?: string
  threadID?: string
  status?: number
  isProcessing?: number
  rejectReason?: string
  automatedSignError?: string
  description?: string
  fileName?: string
  [key: string]: unknown
}

export function transformDocument(
  raw: RawEvrotrustDocumentStatus,
  envelopeId: string,
  order: number,
): Document {
  const id = pickStr(raw.transactionID) ?? `${envelopeId}:doc:${order}`
  const name =
    pickStr(raw.fileName) ?? pickStr(raw.description) ?? `document-${order}`
  return {
    id,
    externalId: id,
    envelopeId,
    name,
    order,
    platform: 'evrotrust',
    metadata: strMap({
      status: raw.status,
      isProcessing: raw.isProcessing,
      rejectReason: raw.rejectReason,
      automatedSignError: raw.automatedSignError,
    }),
    raw,
  }
}
