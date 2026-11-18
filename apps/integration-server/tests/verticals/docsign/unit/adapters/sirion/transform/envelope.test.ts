import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSirionContract,
} from '../../../../../../../src/verticals/docsign/adapters/sirion/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const rawContract: RawSirionContract = {
  contractId: 'ctr-sirion-1',
  title: 'Master Services Agreement',
  status: 'OUT_FOR_SIGNATURE',
  description: 'Please review and execute this agreement.',
  owner: {
    userId: 'usr-olivia',
    emailId: 'olivia@company.com',
    displayName: 'Olivia Admin',
  },
  counterParty: { partyId: 'party-acme', name: 'Acme Corp' },
  signatories: [
    { signatoryId: 'sig-alice', emailId: 'alice@example.com', signingOrder: 1 },
    { signatoryId: 'sig-bob', emailId: 'bob@example.com', signingOrder: 2 },
  ],
  documents: [
    { documentId: 'doc-001', fileName: 'MSA.pdf' },
    { documentId: 'doc-002', fileName: 'Exhibit-A.pdf' },
  ],
  signingOrderEnabled: true,
  contractTemplateId: 'tmpl-msa-001',
  createdOn: '2024-01-15T09:30:00.000Z',
  sentOn: '2024-01-15T10:00:00.000Z',
  lastModifiedOn: '2024-01-20T08:00:00.000Z',
  expiryDate: '2024-03-09T00:00:00.000Z',
}

describe('sirion transformEnvelope', () => {
  it('maps contractId to id and externalId', () => {
    const result = transformEnvelope(rawContract)
    expect(result.id).toBe('ctr-sirion-1')
    expect(result.externalId).toBe('ctr-sirion-1')
  })

  it('maps OUT_FOR_SIGNATURE status to sent', () => {
    const result = transformEnvelope(rawContract)
    expect(result.status).toBe('sent')
  })

  it('maps DRAFT status to draft', () => {
    const result = transformEnvelope({ ...rawContract, status: 'DRAFT' })
    expect(result.status).toBe('draft')
  })

  it('maps EXECUTED status to completed', () => {
    const result = transformEnvelope({ ...rawContract, status: 'EXECUTED' })
    expect(result.status).toBe('completed')
  })

  it('maps DECLINED status to declined', () => {
    const result = transformEnvelope({ ...rawContract, status: 'DECLINED' })
    expect(result.status).toBe('declined')
  })

  it('maps CANCELLED status to voided', () => {
    const result = transformEnvelope({ ...rawContract, status: 'CANCELLED' })
    expect(result.status).toBe('voided')
  })

  it('maps EXPIRED status to expired', () => {
    const result = transformEnvelope({ ...rawContract, status: 'EXPIRED' })
    expect(result.status).toBe('expired')
  })

  it('maps PARTIALLY_SIGNED status to delivered', () => {
    const result = transformEnvelope({ ...rawContract, status: 'PARTIALLY_SIGNED' })
    expect(result.status).toBe('delivered')
  })

  it('maps title to subject', () => {
    const result = transformEnvelope(rawContract)
    expect(result.subject).toBe('Master Services Agreement')
  })

  it('maps description to message', () => {
    const result = transformEnvelope(rawContract)
    expect(result.message).toBe('Please review and execute this agreement.')
  })

  it('maps owner.userId to senderId', () => {
    const result = transformEnvelope(rawContract)
    expect(result.senderId).toBe('usr-olivia')
  })

  it('maps owner.emailId to senderEmail', () => {
    const result = transformEnvelope(rawContract)
    expect(result.senderEmail).toBe('olivia@company.com')
  })

  it('maps owner.displayName to senderName', () => {
    const result = transformEnvelope(rawContract)
    expect(result.senderName).toBe('Olivia Admin')
  })

  it('detects sequential signing when signingOrderEnabled is true', () => {
    const result = transformEnvelope(rawContract)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects sequential when signatories have different signingOrder values', () => {
    const result = transformEnvelope({
      ...rawContract,
      signingOrderEnabled: false,
      signatories: [
        { signatoryId: 'sig-alice', signingOrder: 1 },
        { signatoryId: 'sig-bob', signingOrder: 2 },
      ],
    })
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel when signingOrderEnabled false and same order', () => {
    const result = transformEnvelope({
      ...rawContract,
      signingOrderEnabled: false,
      signatories: [
        { signatoryId: 'sig-alice', signingOrder: 0 },
        { signatoryId: 'sig-bob', signingOrder: 0 },
      ],
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('maps signatories signatoryIds to signerIds', () => {
    const result = transformEnvelope(rawContract)
    expect(result.signerIds).toEqual(['sig-alice', 'sig-bob'])
  })

  it('maps document documentIds to documentIds', () => {
    const result = transformEnvelope(rawContract)
    expect(result.documentIds).toEqual(['doc-001', 'doc-002'])
  })

  it('maps contractTemplateId to templateId', () => {
    const result = transformEnvelope(rawContract)
    expect(result.templateId).toBe('tmpl-msa-001')
  })

  it('maps createdOn to createdAt ISO', () => {
    const result = transformEnvelope(rawContract)
    expect(result.createdAt).toBe('2024-01-15T09:30:00.000Z')
  })

  it('maps sentOn to sentAt ISO', () => {
    const result = transformEnvelope(rawContract)
    expect(result.sentAt).toBe('2024-01-15T10:00:00.000Z')
  })

  it('maps expiryDate to expiresAt', () => {
    const result = transformEnvelope(rawContract)
    expect(result.expiresAt).toBe('2024-03-09T00:00:00.000Z')
  })

  it('maps lastModifiedOn to updatedAt', () => {
    const result = transformEnvelope(rawContract)
    expect(result.updatedAt).toBe('2024-01-20T08:00:00.000Z')
  })

  it('sets platform to sirion', () => {
    const result = transformEnvelope(rawContract)
    expect(result.platform).toBe('sirion')
  })

  it('puts counterParty name into metadata', () => {
    const result = transformEnvelope(rawContract)
    expect(result.metadata.counterParty).toBe('Acme Corp')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(rawContract)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('returns empty signerIds when no signatories', () => {
    const result = transformEnvelope({ ...rawContract, signatories: [] })
    expect(result.signerIds).toEqual([])
  })
})
