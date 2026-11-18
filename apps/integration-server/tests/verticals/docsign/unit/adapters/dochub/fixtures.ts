/**
 * DocHub fixtures, all taken from the documented examples for
 * GET /api/v2/sign-requests/{id} (operationId getSignRequest) in
 * https://dev.dochub.com/api-reference/openapi.yaml ("DocHub Public API V2").
 *
 * - SIGNER_PENDING is `signersData[0]` of the flat-JSON (`application/json`)
 *   example "Sign request in progress (flat JSON, include=document,user.entity,signers.user)".
 * - SIGNER_FINALIZED carries the attribute values of signer `signer890jkl` from
 *   the JSON:API example of the same operation, laid out in the flat
 *   `signersData` item shape (`sign_request_flat_resource.signersData.items`).
 * - DOCUMENT is the embedded `document` of that flat-JSON example.
 * - SIGN_REQUEST is the flat-JSON example itself (the creator `user` object
 *   omitted; the adapter does not read it).
 */
import type { RawDochubSignerData } from '../../../../../../src/verticals/docsign/adapters/dochub/transform/signer'
import type { RawDochubDocument } from '../../../../../../src/verticals/docsign/adapters/dochub/transform/document'
import type { RawDochubFlatSignRequest } from '../../../../../../src/verticals/docsign/adapters/dochub/transform/sign-request'

export const SIGNER_PENDING: RawDochubSignerData = {
  id: 'signer789ghi',
  type: 'signers',
  status: 'pending',
  email: 'signer1@example.com',
  name: 'John Doe',
  queuePosition: null,
  finalizationMessage: null,
  phone: null,
  removed: false,
  createdAt: '2024-01-15T10:30:00.000Z',
  updatedAt: '2024-01-15T10:30:00.000Z',
  viewedAt: '2024-01-18T09:15:00.000Z',
  signedAt: null,
  user: {
    id: 'user789ghi',
    type: 'users',
    name: 'John Doe',
    email: 'signer1@example.com',
    companyName: null,
    url: null,
  },
}

export const SIGNER_FINALIZED: RawDochubSignerData = {
  id: 'signer890jkl',
  type: 'signers',
  status: 'finalized',
  email: 'signer2@example.com',
  name: 'Jane Smith',
  queuePosition: null,
  finalizationMessage: 'Approved',
  updatedAt: '2024-01-18T14:30:00.000Z',
  createdAt: '2024-01-15T10:30:00.000Z',
  removed: false,
  phone: '+15551234567',
  viewedAt: '2024-01-18T09:15:00.000Z',
  signedAt: '2024-01-18T14:30:00.000Z',
}

export const DOCUMENT: RawDochubDocument = {
  id: 'doc123abc',
  type: 'documents',
  title: 'Contract Agreement',
  subtitle: null,
  fullUrl: 'https://dochub.com/d/doc123abc',
  auditUrl: null,
  isTemplate: false,
  createdAt: '2024-01-15T09:00:00.000Z',
  updatedAt: '2024-01-15T09:00:00.000Z',
  microsoftAttachmentId: null,
}

export const SIGN_REQUEST: RawDochubFlatSignRequest = {
  id: 'sr123abc',
  type: 'sign-requests',
  status: 'IN_PROGRESS',
  hasQueue: false,
  emailContent: {
    subject: 'ACTION NEEDED: Contract Agreement',
    body: 'Please review, sign, and complete this document.',
  },
  createdBySigner: false,
  createdAt: '2024-01-15T10:30:00.000Z',
  updatedAt: '2024-01-20T14:45:00.000Z',
  compiledPdfId: null,
  compiledPdfIds: [],
  documentId: 'doc123abc',
  document: DOCUMENT,
  userId: 'user456def',
  signers: ['signer789ghi'],
  signersData: [SIGNER_PENDING],
}
