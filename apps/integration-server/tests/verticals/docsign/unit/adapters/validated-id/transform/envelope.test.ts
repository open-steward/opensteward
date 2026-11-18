import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawValidatedIdDocumentInfo,
} from '../../../../../../../src/verticals/docsign/adapters/validated-id/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('validated-id transformEnvelope', () => {
  const raw: RawValidatedIdDocumentInfo = {
    DocGUI: 'doc-gui-001',
    FileName: 'contract.pdf',
    DocStatus: 'Unsigned',
    Downloaded: false,
    IssuerName: 'Acme Corp',
    CreationTime: '2024-03-10T12:00:00.000Z',
    CompletedTime: '2024-03-20T10:00:00.000Z',
    ExpirationDate: '2024-06-10T12:00:00.000Z',
    AdditionalData: 'some-data',
    Tag: 'q1-batch',
    Signers: [
      { SignerGUI: 'signer-gui-001', SignerName: 'Jane Doe', SignatureStatus: 'Unsigned' },
      { SignerGUI: 'signer-gui-002', SignerName: 'Bob Smith', SignatureStatus: 'Signed' },
    ],
  }

  it('maps id and externalId from DocGUI', () => {
    const result = transformEnvelope(raw)
    expect(result.id).toBe('doc-gui-001')
    expect(result.externalId).toBe('doc-gui-001')
  })

  it('maps Unsigned DocStatus → sent', () => {
    const result = transformEnvelope(raw)
    expect(result.status).toBe('sent')
  })

  it('maps Signed DocStatus → completed', () => {
    const result = transformEnvelope({ ...raw, DocStatus: 'Signed' })
    expect(result.status).toBe('completed')
  })

  it('maps Rejected DocStatus → declined', () => {
    const result = transformEnvelope({ ...raw, DocStatus: 'Rejected' })
    expect(result.status).toBe('declined')
  })

  it('maps unknown DocStatus → sent (default)', () => {
    const result = transformEnvelope({ ...raw, DocStatus: 'Unknown' })
    expect(result.status).toBe('sent')
  })

  it('maps FileName to subject', () => {
    const result = transformEnvelope(raw)
    expect(result.subject).toBe('contract.pdf')
  })

  it('sets subject to empty string when FileName is absent', () => {
    const result = transformEnvelope({ ...raw, FileName: undefined })
    expect(result.subject).toBe('')
  })

  it('maps IssuerName to senderName', () => {
    const result = transformEnvelope(raw)
    expect(result.senderName).toBe('Acme Corp')
  })

  it('sets signingOrder to sequential', () => {
    const result = transformEnvelope(raw)
    expect(result.signingOrder).toBe('sequential')
  })

  it('maps Signers[].SignerGUI to signerIds', () => {
    const result = transformEnvelope(raw)
    expect(result.signerIds).toEqual(['signer-gui-001', 'signer-gui-002'])
  })

  it('sets documentIds to [DocGUI]', () => {
    const result = transformEnvelope(raw)
    expect(result.documentIds).toEqual(['doc-gui-001'])
  })

  it('maps CreationTime to createdAt', () => {
    const result = transformEnvelope(raw)
    expect(result.createdAt).toBe('2024-03-10T12:00:00.000Z')
  })

  it('maps ExpirationDate to expiresAt', () => {
    const result = transformEnvelope(raw)
    expect(result.expiresAt).toBe('2024-06-10T12:00:00.000Z')
  })

  it('maps CompletedTime to completedAt when status is completed', () => {
    const result = transformEnvelope({ ...raw, DocStatus: 'Signed' })
    expect(result.completedAt).toBe('2024-03-20T10:00:00.000Z')
  })

  it('does not set completedAt when status is not completed', () => {
    const result = transformEnvelope(raw)
    expect(result.completedAt).toBeUndefined()
  })

  it('maps CompletedTime to declinedAt when status is declined', () => {
    const result = transformEnvelope({ ...raw, DocStatus: 'Rejected' })
    expect(result.declinedAt).toBe('2024-03-20T10:00:00.000Z')
  })

  it('does not set declinedAt when status is not declined', () => {
    const result = transformEnvelope(raw)
    expect(result.declinedAt).toBeUndefined()
  })

  it('sets platform to validated-id', () => {
    const result = transformEnvelope(raw)
    expect(result.platform).toBe('validated-id')
  })

  it('surfaces docStatus, downloaded, additionalData, and tag in metadata', () => {
    const result = transformEnvelope(raw)
    expect(result.metadata.docStatus).toBe('Unsigned')
    expect(result.metadata.downloaded).toBe('false')
    expect(result.metadata.additionalData).toBe('some-data')
    expect(result.metadata.tag).toBe('q1-batch')
  })

  it('handles absent Signers with empty signerIds', () => {
    const result = transformEnvelope({ ...raw, Signers: undefined })
    expect(result.signerIds).toEqual([])
  })

  it('skips Signers without SignerGUI', () => {
    const rawNoGUI: RawValidatedIdDocumentInfo = {
      ...raw,
      Signers: [{ SignerName: 'No GUI' }, { SignerGUI: 'signer-gui-003' }],
    }
    const result = transformEnvelope(rawNoGUI)
    expect(result.signerIds).toEqual(['signer-gui-003'])
  })

  it('passes EnvelopeSchema.parse without throwing', () => {
    const result = transformEnvelope(raw)
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
