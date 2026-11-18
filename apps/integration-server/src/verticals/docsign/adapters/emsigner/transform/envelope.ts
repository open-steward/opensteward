/**
 * emSigner workflow -> canonical Envelope.
 *
 * An envelope is an emSigner workflow, read from two documented replies
 * (https://api.emsigner.com/swagger/docs/v1):
 *
 *   - its row of POST /api/GetAllDocuments (`FilesView`), which carries the
 *     name, status, originator and upload time;
 *   - POST /api/GetWorkflowInfo (`WorkflowInfo`), which carries the signing
 *     order, signatories and documents. The row's own `WorkflowType` is an
 *     integer whose values no emSigner doc lists, while WorkflowInfo's is a
 *     string documented in the Postman collection
 *     (https://documenter.getpostman.com/view/40123569/2sAYBbe8yV) as
 *     "Type of workflow (e.g., \"Serial\", \"Parallel\")".
 *
 * Status: the only documented values are the Postman collection's for the
 * GetAllDocuments `Status` field, "Status of the workflow (e.g., Pending,
 * Completed)". That is an example for a request filter, not a documented
 * reply enum, so reading Pending as 'sent' (out for signature) is an
 * inference. Anything else is 'unknown', with the upstream value kept in
 * metadata.emsignerStatus.
 */
import type { Envelope, EnvelopeStatus } from '../../../schema/envelope'
import type { RawEmSignerFilesView, RawEmSignerWorkflowInfo } from '../types'
import { isoOrUndefined, optStr, requireIntId, strMap } from './shared'
import { signerId } from './signer'
import { documentId } from './document'

function mapStatus(status: string | undefined): EnvelopeStatus {
  switch (status) {
    case 'Pending':
      return 'sent'
    case 'Completed':
      return 'completed'
    default:
      return 'unknown'
  }
}

function signingOrder(type: string | undefined, id: string): Envelope['signingOrder'] {
  if (type === 'Serial') return 'sequential'
  if (type === 'Parallel') return 'parallel'
  throw new Error(
    `emsigner workflow ${id} has an undocumented WorkflowType ${JSON.stringify(type)}`,
  )
}

export function transformEnvelope(
  row: RawEmSignerFilesView,
  info: RawEmSignerWorkflowInfo,
): Envelope {
  const id = requireIntId(row.WorkFlowId, 'GetAllDocuments WorkFlowId')
  const infoId = requireIntId(info.WorkflowId, `GetWorkflowInfo WorkflowId for workflow ${id}`)
  if (infoId !== id) {
    throw new Error(`emsigner GetWorkflowInfo answered workflow ${infoId} for workflow ${id}`)
  }
  return {
    id,
    externalId: id,
    status: mapStatus(row.Status),
    subject: optStr(row.DisplayName) ?? '',
    senderId: row.OriginatorId === undefined ? undefined : String(row.OriginatorId),
    senderName: optStr(info.DocumentOwner),
    signingOrder: signingOrder(info.WorkflowType, id),
    signerIds: (info.Signatories ?? []).map((_, i) => signerId(id, i)),
    documentIds: (info.DocumentInfo ?? []).map((d) => documentId(d, id)),
    createdAt: isoOrUndefined(row.UploadTime),
    declinedAt: isoOrUndefined(info.DeclinedDate),
    platform: 'emsigner',
    metadata: strMap({
      emsignerStatus: row.Status,
      workflowStatus: info.WorkflowStatus,
      customStatus: row.CustomStatus,
      referenceNo: row.Referenceno,
      documentNumber: row.DocumentNumber,
      categoryName: row.CategoryName,
      name: row.Name,
      uploadTime: row.UploadTime,
    }),
    raw: { row, info },
  }
}
