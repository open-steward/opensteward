import { describe, it, expect } from 'vitest'
import {
  transformEnvelope,
  type RawDocumensoDocument,
} from '../../../../../../../src/verticals/docsign/adapters/documenso/transform/envelope'
import { EnvelopeSchema } from '../../../../../../../src/verticals/docsign/schema/envelope'

describe('documenso transformEnvelope', () => {
  it('maps a COMPLETED document to status=completed with sequential signers', () => {
    const raw: RawDocumensoDocument = {
      id: 42,
      externalId: 'ext-42',
      userId: 7,
      title: 'Master Services Agreement',
      status: 'COMPLETED',
      documentDataId: 'data-abc',
      source: 'UPLOAD',
      visibility: 'EVERYONE',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-10T00:00:00.000Z',
      completedAt: '2025-01-10T00:00:00.000Z',
      recipients: [
        {
          id: 1,
          email: 'alice@example.com',
          name: 'Alice',
          role: 'SIGNER',
          signingOrder: 1,
          signingStatus: 'SIGNED',
          signedAt: '2025-01-05T00:00:00.000Z',
          readStatus: 'OPENED',
          sendStatus: 'SENT',
        },
        {
          id: 2,
          email: 'bob@example.com',
          name: 'Bob',
          role: 'SIGNER',
          signingOrder: 2,
          signingStatus: 'SIGNED',
          signedAt: '2025-01-08T00:00:00.000Z',
          readStatus: 'OPENED',
          sendStatus: 'SENT',
        },
      ],
      documentMeta: {
        subject: 'Please sign the MSA',
        message: 'Attached for your review.',
        signingOrder: 'SEQUENTIAL',
      },
    }
    const result = transformEnvelope(raw)

    expect(result.id).toBe('42')
    expect(result.externalId).toBe('ext-42')
    expect(result.status).toBe('completed')
    // title preferred as subject
    expect(result.subject).toBe('Master Services Agreement')
    expect(result.senderId).toBe('7')
    expect(result.signingOrder).toBe('sequential')
    // sorted by signingOrder
    expect(result.signerIds).toEqual(['1', '2'])
    expect(result.documentIds).toEqual(['42'])
    expect(result.createdAt).toBe('2025-01-01T00:00:00.000Z')
    expect(result.completedAt).toBe('2025-01-10T00:00:00.000Z')
    expect(result.platform).toBe('documenso')

    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a PENDING document to status=sent and populates sentAt from createdAt', () => {
    const raw: RawDocumensoDocument = {
      id: 10,
      title: 'Quick NDA',
      status: 'PENDING',
      createdAt: '2025-03-01T00:00:00.000Z',
      updatedAt: '2025-03-01T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('sent')
    // For PENDING docs sentAt = createdAt
    expect(result.sentAt).toBe('2025-03-01T00:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a REJECTED document to status=declined with declinedAt from updatedAt', () => {
    const raw: RawDocumensoDocument = {
      id: 20,
      title: 'Declined Contract',
      status: 'REJECTED',
      createdAt: '2025-04-01T00:00:00.000Z',
      updatedAt: '2025-04-05T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe('2025-04-05T00:00:00.000Z')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('maps a DRAFT document to status=draft with no sentAt', () => {
    const raw: RawDocumensoDocument = {
      id: 30,
      title: 'Draft Agreement',
      status: 'DRAFT',
      createdAt: '2025-05-01T00:00:00.000Z',
    }
    const result = transformEnvelope(raw)

    expect(result.status).toBe('draft')
    expect(result.sentAt).toBeUndefined()
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })

  it('infers sequential signing from distinct recipient signingOrder values', () => {
    const raw: RawDocumensoDocument = {
      id: 50,
      status: 'PENDING',
      recipients: [
        {
          id: 5,
          email: 'x@e.com',
          signingOrder: 1,
          signingStatus: 'NOT_SIGNED',
          readStatus: 'NOT_OPENED',
          sendStatus: 'SENT',
        },
        {
          id: 6,
          email: 'y@e.com',
          signingOrder: 2,
          signingStatus: 'NOT_SIGNED',
          readStatus: 'NOT_OPENED',
          sendStatus: 'NOT_SENT',
        },
      ],
      // no documentMeta.signingOrder
    }
    const result = transformEnvelope(raw)

    expect(result.signingOrder).toBe('sequential')
    expect(() => EnvelopeSchema.parse(result)).not.toThrow()
  })
})
