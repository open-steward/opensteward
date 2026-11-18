/**
 * Fixtures shaped by the WeSign v3 OpenAPI
 * (https://wse.comsigntrust.com/api/swagger/v3/swagger.json):
 * `DocumentCollectionResposneDTO`, `SignerResponseDTO`, `ContactResponseDTO`,
 * `UserResponseDTO` and `DocumentCountResponseDTO`. Field names and enum
 * values are the documented ones; the spec carries no example values, so the
 * values here are illustrative.
 */
import type { RawWeSignDocumentCollection } from '../../../../../../../src/verticals/docsign/adapters/comsigntrust/transform/envelope'
import type { RawWeSignSigner } from '../../../../../../../src/verticals/docsign/adapters/comsigntrust/transform/signer'
import type { RawWeSignDocumentCount } from '../../../../../../../src/verticals/docsign/adapters/comsigntrust/transform/document'

export const COLLECTION_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6'
export const DOC_ID_1 = '9b2f1c55-0a4e-4d7e-9f0e-1f6c0b7c1a01'
export const DOC_ID_2 = '9b2f1c55-0a4e-4d7e-9f0e-1f6c0b7c1a02'
export const SIGNER_ID_1 = 'c1a0e7d2-3b44-4f5a-8a6b-0d9e8f7a6b01'
export const SIGNER_ID_2 = 'c1a0e7d2-3b44-4f5a-8a6b-0d9e8f7a6b02'

export function signer(overrides: Partial<RawWeSignSigner> = {}): RawWeSignSigner {
  return {
    id: SIGNER_ID_1,
    name: 'Dana Levi',
    status: 3,
    timeSent: '2026-03-01T08:00:00',
    timeViewed: '2026-03-01T09:15:00',
    timeSigned: '2026-03-01T09:20:00',
    timeRejected: '0001-01-01T00:00:00',
    sendingMethod: 2,
    signerNote: null,
    userNote: null,
    emailNote: null,
    attachments: [{ name: 'id-card.png', base64File: 'iVBORw0KGgo=' }],
    contact: {
      id: '5d1e2f3a-4b5c-4d6e-8f70-8192a3b4c5d6',
      name: 'Dana Levi',
      email: 'dana.levi@example.com',
      phone: '0501234567',
      phoneExtension: '+972',
      defaultSendingMethod: 2,
      seals: [
        { id: '6e7f8a9b-0c1d-4e2f-9a3b-4c5d6e7f8a9b', name: 'seal', base64Image: 'iVBORw0KGgo=' },
      ],
      searchTag: null,
    },
    signerAuthentication: {
      otpDetails: {
        identification: '0501234567',
        code: '482913',
        attempts: 0,
        expirationTime: '2026-03-01T09:30:00',
        mode: 1,
      },
      authenticationMode: 0,
    },
    ...overrides,
  }
}

export function collection(
  overrides: Partial<RawWeSignDocumentCollection> = {},
): RawWeSignDocumentCollection {
  return {
    documentCollectionId: COLLECTION_ID,
    distributionId: '00000000-0000-0000-0000-000000000000',
    name: 'Lease agreement',
    documentStatus: 4,
    mode: 1,
    documentsIds: [DOC_ID_1, DOC_ID_2],
    signers: [signer(), signer({ id: SIGNER_ID_2, name: 'Noa Cohen', status: 1 })],
    creationTime: '2026-03-01T07:59:00',
    signedTime: '2026-03-01T10:00:00',
    isWillDeletedIn24Hours: false,
    user: {
      id: '7a8b9c0d-1e2f-4a3b-8c4d-5e6f7a8b9c0d',
      companyId: '8b9c0d1e-2f3a-4b4c-9d5e-6f7a8b9c0d1e',
      groupId: '9c0d1e2f-3a4b-4c5d-8e6f-7a8b9c0d1e2f',
      name: 'Avi Sender',
      email: 'avi.sender@example.com',
      type: 2,
      creationTime: '2025-01-01T00:00:00',
      companySigner1Details: {
        certId: 'cert-1',
        shouldSignAsDefaultValue: false,
        shouldShowInUI: false,
      },
      lastSeen: '2026-03-01T07:00:00',
      username: 'avi',
    },
    shouldSignUsingSigner1AfterDocumentSigningFlow: false,
    ...overrides,
  }
}

export function documentCount(
  overrides: Partial<RawWeSignDocumentCount> = {},
): RawWeSignDocumentCount {
  return {
    documentId: DOC_ID_1,
    templateId: 'aa11bb22-cc33-4d44-8e55-ff6677889900',
    documentName: 'lease.pdf',
    pagesCount: 4,
    ...overrides,
  }
}
