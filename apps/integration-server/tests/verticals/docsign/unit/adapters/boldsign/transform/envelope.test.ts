import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  signerExternalId,
  type RawBoldsignDocument,
  type RawBoldsignSignerDetail,
} from '../../../../../../../src/verticals/docsign/adapters/boldsign/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const CREATED_EPOCH = 1705312800 // 2024-01-15T10:00:00.000Z
const ACTIVITY_EPOCH = 1708000000 // 2024-02-15T12:26:40.000Z
const EXPIRY_EPOCH = 1710000000 // 2024-03-09T16:00:00.000Z

const signerA: RawBoldsignSignerDetail = {
  signerName: 'Alice',
  signerEmail: 'alice@example.com',
  signerRole: 'Signer',
  signerType: 'Signer',
  status: 'Completed',
  order: 1,
  signedDate: ACTIVITY_EPOCH,
}

const signerB: RawBoldsignSignerDetail = {
  signerName: 'Bob',
  signerEmail: 'bob@example.com',
  signerRole: 'Approver',
  signerType: 'Approver',
  status: 'NotCompleted',
  order: 2,
}

const rawDoc: RawBoldsignDocument = {
  documentId: 'doc-abc-123',
  messageTitle: 'Please sign the NDA',
  documentDescription: 'Non-disclosure agreement for Q1 partnership',
  status: 'inprogress',
  senderDetail: {
    userId: 'usr-sender-1',
    emailAddress: 'sender@company.com',
    name: 'Sender Name',
  },
  signerDetails: [signerA, signerB],
  enableSigningOrder: true,
  createdDate: CREATED_EPOCH,
  activityDate: ACTIVITY_EPOCH,
  expiryDate: EXPIRY_EPOCH,
  files: [
    { documentName: 'NDA.pdf', pageCount: 5 },
    { documentName: 'Exhibit-A.pdf', pageCount: 2 },
  ],
  templateId: 'tmpl-nda-001',
  labels: ['legal', 'nda'],
}

describe('boldsign transformEnvelope', () => {
  it('maps documentId to id and externalId', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.id).toBe('doc-abc-123')
    expect(result.externalId).toBe('doc-abc-123')
  })

  it('maps inprogress status to sent', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.status).toBe('sent')
  })

  it('maps subject from messageTitle', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.subject).toBe('Please sign the NDA')
  })

  it('maps message from documentDescription', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.message).toBe('Non-disclosure agreement for Q1 partnership')
  })

  it('maps sender fields from senderDetail', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.senderId).toBe('usr-sender-1')
    expect(result.senderEmail).toBe('sender@company.com')
    expect(result.senderName).toBe('Sender Name')
  })

  it('maps enableSigningOrder:true to sequential', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps signerIds in order using email-based externalId', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.signerIds).toEqual([
      'doc-abc-123:alice@example.com',
      'doc-abc-123:bob@example.com',
    ])
  })

  it('maps documentIds as documentId:index', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.documentIds).toEqual(['doc-abc-123:0', 'doc-abc-123:1'])
  })

  it('maps templateId', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.templateId).toBe('tmpl-nda-001')
  })

  it('maps epoch second timestamps to ISO strings', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.createdAt).toBe(new Date(CREATED_EPOCH * 1000).toISOString())
    expect(result.updatedAt).toBe(new Date(ACTIVITY_EPOCH * 1000).toISOString())
    expect(result.expiresAt).toBe(new Date(EXPIRY_EPOCH * 1000).toISOString())
  })

  it('sets platform to boldsign', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.platform).toBe('boldsign')
  })

  it('puts labels into metadata', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.metadata.labels).toBe('legal,nda')
  })

  it('does not set completedAt when status is not completed', () => {
    const result = transformEnvelope(rawDoc)
    expect(result.completedAt).toBeUndefined()
  })

  it('sets completedAt from activityDate when status is completed', () => {
    const result = transformEnvelope({ ...rawDoc, status: 'Completed' })
    expect(result.completedAt).toBe(new Date(ACTIVITY_EPOCH * 1000).toISOString())
    expect(result.status).toBe('completed')
  })

  it('maps revoked status to voided and sets voidedAt', () => {
    const result = transformEnvelope({
      ...rawDoc,
      status: 'Revoked',
      revokeMessage: 'Contract cancelled',
    })
    expect(result.status).toBe('voided')
    expect(result.voidedAt).toBe(new Date(ACTIVITY_EPOCH * 1000).toISOString())
    expect(result.metadata.revokeMessage).toBe('Contract cancelled')
  })

  it('maps declined status to declined and sets declinedAt', () => {
    const result = transformEnvelope({ ...rawDoc, status: 'Declined' })
    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe(new Date(ACTIVITY_EPOCH * 1000).toISOString())
  })

  it('maps draft status to draft', () => {
    const result = transformEnvelope({ ...rawDoc, status: 'Draft' })
    expect(result.status).toBe('draft')
  })

  it('maps expired status to expired', () => {
    const result = transformEnvelope({ ...rawDoc, status: 'Expired' })
    expect(result.status).toBe('expired')
  })

  it('infers parallel signing when signers share same order', () => {
    const result = transformEnvelope({
      ...rawDoc,
      enableSigningOrder: false,
      signerDetails: [
        { ...signerA, order: 1 },
        { ...signerB, order: 1 },
      ],
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('falls back to signerName for signerExternalId when no email', () => {
    const noEmail: RawBoldsignSignerDetail = { signerName: 'NoEmail', order: 1 }
    expect(signerExternalId('doc-x', noEmail)).toBe('doc-x:NoEmail')
  })

  it('falls back to unknown for signerExternalId when no name or email', () => {
    expect(signerExternalId('doc-x', {})).toBe('doc-x:unknown')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(rawDoc)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('returns empty documentIds when files is absent', () => {
    const result = transformEnvelope({ ...rawDoc, files: undefined })
    expect(result.documentIds).toEqual([])
  })
})
