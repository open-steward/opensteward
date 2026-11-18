import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSecuredSigningDocument,
} from '../../../../../../../src/verticals/docsign/adapters/secured-signing/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('secured-signing transformEnvelope', () => {
  const raw: RawSecuredSigningDocument = {
    Reference: 'REF-001',
    Name: 'Partnership Agreement',
    Status: 'Complete',
    Signers: [
      { SignerReference: 'SREF-001', FirstName: 'Bob', LastName: 'Doe', Email: 'bob@example.com' },
      {
        SignerReference: 'SREF-002',
        FirstName: 'Carol',
        LastName: 'Smith',
        Email: 'carol@example.com',
      },
    ],
    DueDate: '2026-04-01T00:00:00.000Z',
    LastSignedDate: '2026-01-20T14:00:00.000Z',
    GMT: '+00:00',
    HasFileUploaded: true,
    PackageReference: 'PKG-001',
    FormDirectReference: 'FDR-001',
    ClientReference: 'CLIENT-001',
    IDVerificationRequested: false,
  }

  it('maps id and externalId from Reference', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('REF-001')
    expect(result.externalId).toBe('REF-001')
  })

  it('maps Complete status to completed', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('completed')
  })

  it('maps Signed status to completed', () => {
    const result = transformEnvelope({ ...raw, Status: 'Signed' })
    expect(result.status).toBe('completed')
  })

  it('maps Declined status to declined', () => {
    const result = transformEnvelope({ ...raw, Status: 'Declined' })
    expect(result.status).toBe('declined')
  })

  it('maps Deleted status to voided', () => {
    const result = transformEnvelope({ ...raw, Status: 'Deleted' })
    expect(result.status).toBe('voided')
  })

  it('maps Expired status to expired', () => {
    const result = transformEnvelope({ ...raw, Status: 'Expired' })
    expect(result.status).toBe('expired')
  })

  it('maps Invitation status to sent', () => {
    const result = transformEnvelope({ ...raw, Status: 'Invitation' })
    expect(result.status).toBe('sent')
  })

  it('maps Initialized status to draft', () => {
    const result = transformEnvelope({ ...raw, Status: 'Initialized' })
    expect(result.status).toBe('draft')
  })

  it('maps subject from Name', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('Partnership Agreement')
  })

  it('always sets signingOrder to sequential', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps signerIds from Signers SignerReferences', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['SREF-001', 'SREF-002'])
  })

  it('maps documentIds to [Reference]', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['REF-001'])
  })

  it('maps completedAt from LastSignedDate when status is completed', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBe('2026-01-20T14:00:00.000Z')
  })

  it('does not set completedAt when status is not completed', () => {
    const result = transformEnvelope({ ...raw, Status: 'Invitation' })
    expect(result.completedAt).toBeUndefined()
  })

  it('maps expiresAt from DueDate', () => {
    const result = transformEnvelope(raw)
    expect(result.expiresAt).toBe('2026-04-01T00:00:00.000Z')
  })

  it('sets platform to secured-signing', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('secured-signing')
  })

  it('includes packageReference and rawStatus in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.packageReference).toBe('PKG-001')
    expect(result.metadata.rawStatus).toBe('Complete')
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
