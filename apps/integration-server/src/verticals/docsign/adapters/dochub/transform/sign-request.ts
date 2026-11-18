import type { RawDochubDocument } from './document'
import type { RawDochubSignerData } from './signer'

/**
 * DocHub's flat sign request (`sign_request_flat_resource` in
 * https://dev.dochub.com/api-reference/openapi.yaml), the
 * `application/json` response of GET /api/v2/sign-requests/{id}. Only the
 * documented fields the signer/document reads use are typed. `document` and
 * `signersData` are present only when requested with `include`: "When
 * `include` is omitted, only relationship identifiers are returned".
 */
export interface RawDochubFlatSignRequest {
  id: string
  type?: 'sign-requests'
  status?: string
  hasQueue?: boolean | null
  emailContent?: { subject?: string; body?: string } | null
  createdBySigner?: boolean | null
  createdAt?: string
  updatedAt?: string
  compiledPdfId?: string | null
  compiledPdfIds?: string[]
  documentId?: string
  document?: RawDochubDocument
  userId?: string
  signers?: string[]
  signersData?: RawDochubSignerData[]
}
