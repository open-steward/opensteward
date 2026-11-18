import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawSignaturelyDocument,
} from '../../../../../../../src/verticals/docsign/adapters/signaturely/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('signaturely transformEnvelope', () => {
  it('maps a completed envelope with a preparer signer to canonical Envelope', () => {
    const raw: RawSignaturelyDocument = {
      id: 'doc-001',
      status: 'completed',
      title: 'Service Agreement',
      message: 'Please sign.',
      isOrdered: true,
      createdAt: '2025-04-01T09:00:00.000Z',
      updatedAt: '2025-04-05T14:00:00.000Z',
      signers: [
        {
          id: 's1',
          userId: 'u1',
          email: 'owner@example.com',
          name: 'Owner',
          isPreparer: true,
          order: 0,
        },
        {
          id: 's2',
          email: 'signer@example.com',
          name: 'Signer',
          isPreparer: false,
          order: 1,
        },
      ],
      templateId: 'tmpl-abc',
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('doc-001')
    expect(result.status).toBe('completed')
    expect(result.subject).toBe('Service Agreement')
    expect(result.signingOrder).toBe('sequential')
    expect(result.signerIds).toEqual(['s1', 's2'])
    expect(result.senderEmail).toBe('owner@example.com')
    expect(result.templateId).toBe('tmpl-abc')
    expect(result.completedAt).toBe('2025-04-05T14:00:00.000Z')
    expect(result.platform).toBe('signaturely')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps an awaiting envelope with parallel signing order', () => {
    const raw: RawSignaturelyDocument = {
      id: 'doc-002',
      status: 'awaiting',
      isOrdered: false,
      signers: [
        { id: 's3', order: 1 },
        { id: 's4', order: 1 },
      ],
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('sent')
    expect(result.signingOrder).toBe('parallel')
    expect(result.documentIds).toEqual([])
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a declined envelope with correct status', () => {
    const raw: RawSignaturelyDocument = {
      id: 'doc-003',
      status: 'declined',
      updatedAt: '2025-05-01T12:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe('2025-05-01T12:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
