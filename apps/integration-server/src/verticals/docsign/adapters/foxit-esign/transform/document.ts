/**
 * Foxit eSign document → canonical Document (metadata only).
 *
 * Source: `folder.documentsList` of "Get Envelope Details",
 * GET /folders/myfolder (Foxit eSign OpenAPI example, served by
 * https://developers.foxitesign.foxit.com/). A documented document:
 *
 *   { "documentId": 101857, "contractId": 101857, "companyId": 12,
 *     "contractCreatedBy": 1, "contractCreatedOn": 1473332676000,
 *     "contractType": "Sample", "contractStatus": "EXECUTED", "editable": false,
 *     "contractVersionId": 101715, "contractVersionName": "Foxit eSign Sample",
 *     "contractVersionDesc": "Foxit eSign Sample Document", "versionCreatedby": 1,
 *     "versionCreatedOn": 1473332676000, "contractVersionNumber": 1 }
 *
 * No size, page count or MIME type is documented, so none is emitted.
 * `order` is the position in `documentsList`, which is the order
 * "Download Single Document PDF" counts in ("The index of the document
 * starting from 1").
 */
import type { Document } from '../../../schema/document'
import { strMap } from './shared'

export interface RawFoxitESignDocument {
  documentId: number
  contractId?: number | null
  companyId?: number | null
  contractCreatedBy?: number | null
  contractCreatedOn?: number | null
  contractType?: string | null
  contractStatus?: string | null
  editable?: boolean | null
  contractVersionId?: number | null
  contractVersionName?: string | null
  contractVersionDesc?: string | null
  versionCreatedby?: number | null
  versionCreatedOn?: number | null
  contractVersionNumber?: number | null
}

export function transformDocument(
  raw: RawFoxitESignDocument,
  envelopeId: string,
  index: number,
): Document {
  if (typeof raw.documentId !== 'number') {
    throw new Error('Foxit eSign document has no documentId')
  }
  if (typeof raw.contractVersionName !== 'string' || raw.contractVersionName === '') {
    throw new Error(`Foxit eSign document ${raw.documentId} has no contractVersionName`)
  }
  const externalId = String(raw.documentId)
  return {
    id: `${envelopeId}:${externalId}`,
    externalId,
    envelopeId,
    name: raw.contractVersionName,
    order: index,
    platform: 'foxit-esign',
    metadata: strMap({
      contractType: raw.contractType,
      contractStatus: raw.contractStatus,
      contractVersionId: raw.contractVersionId,
      contractVersionNumber: raw.contractVersionNumber,
      contractVersionDesc: raw.contractVersionDesc,
    }),
    raw,
  }
}
