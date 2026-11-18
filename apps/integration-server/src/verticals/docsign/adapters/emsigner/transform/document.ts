/**
 * emSigner workflow document -> canonical Document.
 *
 * Read from `WorkflowInfo.DocumentInfo` of POST /api/GetWorkflowInfo
 * (https://api.emsigner.com/swagger/docs/v1, `BusinessObject.BusinessObject.DocumentInfo`:
 * TemplateId, DocumentName, DocumentId (int32), UploadDateTime, DocumentSize
 * (string), Modifieddate, LastModifiedBy, DeclinedDate).
 *
 * `DocumentSize` is a string in no documented unit, so it stays in metadata
 * rather than becoming sizeBytes. No field gives a MIME type or page count.
 */
import type { Document } from '../../../schema/document'
import type { RawEmSignerDocumentInfo } from '../types'
import { optStr, requireIntId, strMap } from './shared'

export function documentId(raw: RawEmSignerDocumentInfo, workflowId: string): string {
  return requireIntId(raw.DocumentId, `DocumentId of a document in workflow ${workflowId}`)
}

export function transformDocument(
  raw: RawEmSignerDocumentInfo,
  workflowId: string,
  order: number,
): Document {
  const id = documentId(raw, workflowId)
  return {
    id,
    externalId: id,
    envelopeId: workflowId,
    name: optStr(raw.DocumentName) ?? '',
    order,
    platform: 'emsigner',
    metadata: strMap({
      templateId: raw.TemplateId,
      documentSize: raw.DocumentSize,
      uploadDateTime: raw.UploadDateTime,
      modifiedDate: raw.Modifieddate,
      lastModifiedBy: raw.LastModifiedBy,
      declinedDate: raw.DeclinedDate,
    }),
    raw,
  }
}
