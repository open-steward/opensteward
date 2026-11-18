import { describe, it, expect } from 'vitest'
import {
  transformSigner,
  type RawDocusealSubmitter,
} from '../../../../../../../src/verticals/docsign/adapters/docuseal/transform/signer'
import { SignerSchema } from '../../../../../../../src/verticals/docsign/schema/signer'

describe('docuseal transformSigner', () => {
  it('maps a completed submitter to status=signed', () => {
    const raw: RawDocusealSubmitter = {
      id: 201,
      submission_id: 101,
      uuid: 'uuid-bob',
      email: 'bob@example.com',
      name: 'Bob Smith',
      slug: 'bob-abc',
      role: 'First Party',
      status: 'completed',
      sent_at: '2025-01-02T00:00:00.000Z',
      opened_at: '2025-01-03T00:00:00.000Z',
      completed_at: '2025-01-05T00:00:00.000Z',
      created_at: '2025-01-01T00:00:00.000Z',
      updated_at: '2025-01-05T00:00:00.000Z',
      phone: '+1555555555',
      external_id: 'ext-bob',
    }
    const result = transformSigner(raw, 101)

    expect(result.id).toBe('201')
    expect(result.externalId).toBe('201')
    expect(result.envelopeId).toBe('101')
    expect(result.email).toBe('bob@example.com')
    expect(result.name).toBe('Bob Smith')
    expect(result.role).toBe('signer')
    expect(result.status).toBe('signed')
    expect(result.sentAt).toBe('2025-01-02T00:00:00.000Z')
    expect(result.deliveredAt).toBe('2025-01-03T00:00:00.000Z')
    expect(result.signedAt).toBe('2025-01-05T00:00:00.000Z')
    expect(result.platform).toBe('docuseal')
    expect(result.metadata.uuid).toBe('uuid-bob')
    expect(result.metadata.slug).toBe('bob-abc')
    expect(result.metadata.role).toBe('First Party')
    expect(result.metadata.phone).toBe('+1555555555')
    expect(result.metadata.externalId).toBe('ext-bob')

    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a declined submitter', () => {
    const raw: RawDocusealSubmitter = {
      id: 202,
      submission_id: 101,
      email: 'carol@example.com',
      name: 'Carol',
      status: 'declined',
      declined_at: '2025-01-06T00:00:00.000Z',
    }
    const result = transformSigner(raw, 101)

    expect(result.status).toBe('declined')
    expect(result.declinedAt).toBe('2025-01-06T00:00:00.000Z')
    expect(result.signedAt).toBeUndefined()
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps an opened submitter to status=delivered', () => {
    const raw: RawDocusealSubmitter = {
      id: 203,
      submission_id: 101,
      email: 'dave@example.com',
      name: 'Dave',
      status: 'opened',
      sent_at: '2025-01-07T00:00:00.000Z',
      opened_at: '2025-01-08T00:00:00.000Z',
    }
    const result = transformSigner(raw, 101)

    expect(result.status).toBe('delivered')
    expect(result.sentAt).toBe('2025-01-07T00:00:00.000Z')
    expect(result.deliveredAt).toBe('2025-01-08T00:00:00.000Z')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps a sent submitter to status=sent', () => {
    const raw: RawDocusealSubmitter = {
      id: 204,
      submission_id: 101,
      email: 'eve@example.com',
      status: 'sent',
      sent_at: '2025-01-09T00:00:00.000Z',
    }
    const result = transformSigner(raw, 101)

    expect(result.status).toBe('sent')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('maps an awaiting submitter to status=created', () => {
    const raw: RawDocusealSubmitter = {
      id: 205,
      submission_id: 101,
      email: 'frank@example.com',
      status: 'awaiting',
    }
    const result = transformSigner(raw, 101)

    expect(result.status).toBe('created')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })

  it('uses submission_id from raw over fallback parameter', () => {
    const raw: RawDocusealSubmitter = {
      id: 206,
      submission_id: 999,
      email: 'g@example.com',
      status: 'sent',
    }
    const result = transformSigner(raw, 101)

    // submission_id on raw (999) wins over the parameter (101)
    expect(result.envelopeId).toBe('999')
    expect(() => SignerSchema.parse(result)).not.toThrow()
  })
})
