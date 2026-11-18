/**
 * emSigner signatory -> canonical Signer.
 *
 * Read from `WorkflowInfo.Signatories` of POST /api/GetWorkflowInfo
 * (https://api.emsigner.com/swagger/docs/v1, `EmsignerAPI.BusinessObject.Signatories`:
 * EmailID, Name, Status, Remarks, SignerType, SignedDate, ModeOfSignature,
 * WorkId, CurrentSignatoryName, PercentageNameMatch). The Postman collection
 * (https://documenter.getpostman.com/view/40123569/2sAYBbe8yV) describes the
 * array as "List of signatories associated with the workflow", so every
 * entry is a signer.
 *
 * No emSigner doc says what `WorkId` identifies or lists the values of
 * `Status` or `SignerType`. So the id is the signatory's position in the
 * workflow (`<workflowId>:<index>`, the order GetWorkflowInfo returns),
 * status is 'unknown' with the upstream value in metadata, and routingOrder
 * is not set.
 */
import type { Signer } from '../../../schema/signer'
import type { RawEmSignerSignatory } from '../types'
import { emailOrUndefined, isoOrUndefined, optStr, strMap } from './shared'

export function signerId(workflowId: string, index: number): string {
  return `${workflowId}:${index}`
}

export function transformSigner(
  raw: RawEmSignerSignatory,
  workflowId: string,
  index: number,
): Signer {
  const id = signerId(workflowId, index)
  return {
    id,
    externalId: id,
    envelopeId: workflowId,
    email: emailOrUndefined(raw.EmailID),
    name: optStr(raw.Name) ?? '',
    role: 'signer',
    status: 'unknown',
    signedAt: isoOrUndefined(raw.SignedDate),
    platform: 'emsigner',
    metadata: strMap({
      emsignerStatus: raw.Status,
      signerType: raw.SignerType,
      modeOfSignature: raw.ModeOfSignature,
      workId: raw.WorkId,
      remarks: raw.Remarks,
      signedDate: raw.SignedDate,
    }),
    raw,
  }
}
