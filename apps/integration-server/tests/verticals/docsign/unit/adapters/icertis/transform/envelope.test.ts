import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawIcertisAgreement,
} from '../../../../../../../src/verticals/docsign/adapters/icertis/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

const base: RawIcertisAgreement = {
  ICMId: 'icm-001',
  AgreementCode: 'AGR-2025-001',
  Name: 'Master Services Agreement',
  Title: 'MSA',
  Status: 'Executed',
  Description: 'Standard MSA',
  OwnerId: 'owner-1',
  OwnerEmail: 'owner@example.com',
  OwnerName: 'Alice Admin',
  TemplateId: 'tmpl-1',
  CreatedOn: '2025-01-01T00:00:00.000Z',
  ModifiedOn: '2025-01-10T00:00:00.000Z',
  ExecutedOn: '2025-01-09T00:00:00.000Z',
  SubmittedOn: '2025-01-05T00:00:00.000Z',
  ExpiryDate: '2026-01-01T00:00:00.000Z',
  Signatories: [
    { ICMId: 'sig-1', Email: 'alice@example.com', SequenceNumber: 1 },
    { ICMId: 'sig-2', Email: 'bob@example.com', SequenceNumber: 2 },
  ],
  AssociatedDocuments: [{ ICMId: 'doc-1', FileName: 'contract.pdf' }],
}

describe('icertis transformEnvelope', () => {
  it('maps id and externalId from ICMId and AgreementCode', () => {
    const result = transformEnvelope(base)
    expect(result.id).toBe('icm-001')
    expect(result.externalId).toBe('AGR-2025-001')
  })

  it('maps Status=Executed to completed', () => {
    const result = transformEnvelope(base)
    expect(result.status).toBe('completed')
  })

  it('maps draft status', () => {
    const result = transformEnvelope({ ...base, Status: 'Draft' })
    expect(result.status).toBe('draft')
  })

  it('maps declined status', () => {
    const result = transformEnvelope({ ...base, Status: 'Declined' })
    expect(result.status).toBe('declined')
  })

  it('maps voided status from cancelled', () => {
    const result = transformEnvelope({ ...base, Status: 'Cancelled' })
    expect(result.status).toBe('voided')
  })

  it('maps expired status', () => {
    const result = transformEnvelope({ ...base, Status: 'Expired' })
    expect(result.status).toBe('expired')
  })

  it('maps sent status for pending approval', () => {
    const result = transformEnvelope({ ...base, Status: 'Pending Approval' })
    expect(result.status).toBe('sent')
  })

  it('maps subject from Name', () => {
    const result = transformEnvelope(base)
    expect(result.subject).toBe('Master Services Agreement')
  })

  it('maps senderEmail and senderName', () => {
    const result = transformEnvelope(base)
    expect(result.senderEmail).toBe('owner@example.com')
    expect(result.senderName).toBe('Alice Admin')
  })

  it('detects sequential signing order when signatories have different SequenceNumbers', () => {
    const result = transformEnvelope(base)
    expect(result.signingOrder).toBe('sequential')
  })

  it('detects parallel signing order when signatories share the same SequenceNumber', () => {
    const result = transformEnvelope({
      ...base,
      Signatories: [
        { ICMId: 'sig-1', SequenceNumber: 1 },
        { ICMId: 'sig-2', SequenceNumber: 1 },
      ],
    })
    expect(result.signingOrder).toBe('parallel')
  })

  it('collects signerIds from Signatories', () => {
    const result = transformEnvelope(base)
    expect(result.signerIds).toEqual(['sig-1', 'sig-2'])
  })

  it('collects documentIds from AssociatedDocuments', () => {
    const result = transformEnvelope(base)
    expect(result.documentIds).toEqual(['doc-1'])
  })

  it('maps templateId', () => {
    const result = transformEnvelope(base)
    expect(result.templateId).toBe('tmpl-1')
  })

  it('maps timestamp fields to ISO strings', () => {
    const result = transformEnvelope(base)
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.completedAt).toBe('2025-01-09T00:00:00.000Z')
    expect(result.updatedAt).toBe('2025-01-10T00:00:00.000Z')
  })

  it('sets platform to icertis', () => {
    const result = transformEnvelope(base)
    expect(result.platform).toBe('icertis')
  })

  it('stores contractType and agreementCode in metadata', () => {
    const result = transformEnvelope({ ...base, ContractType: 'NDA' })
    expect(result.metadata['contractType']).toBe('NDA')
    expect(result.metadata['agreementCode']).toBe('AGR-2025-001')
  })

  it('passes EnvelopeSchema validation', () => {
    const result = transformEnvelope(base)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('handles missing optional fields gracefully', () => {
    const minimal: RawIcertisAgreement = { ICMId: 'icm-min' }
    const result = transformEnvelope(minimal)
    expect(result.id).toBe('icm-min')
    expect(result.subject).toBe('')
    expect(result.signerIds).toEqual([])
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('merges ExternalSignatory into signerIds', () => {
    const result = transformEnvelope({
      ...base,
      Signatories: [],
      ExternalSignatory: [{ ICMId: 'ext-1', Email: 'ext@example.com' }],
    })
    expect(result.signerIds).toContain('ext-1')
  })
})
